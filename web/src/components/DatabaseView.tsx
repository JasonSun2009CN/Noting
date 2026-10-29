import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  Hash,
  LayoutGrid,
  Link2,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Plus,
  Search,
  Table2,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../api';
import type { Database, DbProp, DbRow, Page, PropType, SelectOption } from '../types';
import {
  SELECT_COLORS,
  cn,
  formatDate,
  relativeTime,
  truncate,
} from '../lib/utils';
import Popover from './Popover';
import Modal from './Modal';
import { MenuItem, MenuLabel, MenuSeparator } from './MenuItems';

interface DatabaseViewProps {
  page: Page;
  database: Database;
}

type ViewMode = 'table' | 'board';
type SortState = { propId: string; dir: 'asc' | 'desc' } | null;

const PROP_TYPES: { type: PropType; label: string; icon: ReactNode; hint: string }[] = [
  { type: 'text', label: 'Text', icon: <Type size={15} />, hint: 'Plain text' },
  { type: 'number', label: 'Number', icon: <Hash size={15} />, hint: 'Numeric value' },
  { type: 'select', label: 'Select', icon: <ChevronDown size={15} />, hint: 'One option' },
  { type: 'multi_select', label: 'Multi-select', icon: <ChevronDown size={15} />, hint: 'Many options' },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare size={15} />, hint: 'Done or not' },
  { type: 'date', label: 'Date', icon: <CalendarDays size={15} />, hint: 'A calendar date' },
  { type: 'url', label: 'URL', icon: <Link2 size={15} />, hint: 'A web link' },
];

function stringValue(value: unknown) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function optionColor(prop: DbProp, name: string) {
  return prop.options.find((option) => option.name === name)?.color || 'gray';
}

function Chip({ name, color }: { name: string; color: string }) {
  return <span className={`db-chip db-chip-${color}`}>{name}</span>;
}

export default function DatabaseView({ page, database }: DatabaseViewProps) {
  const { toast, confirm } = useApp();

  const [properties, setProperties] = useState<DbProp[]>(database.props);
  const [rows, setRows] = useState<DbRow[]>(database.rows);
  const [view, setView] = useState<ViewMode>('table');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const [groupPropId, setGroupPropId] = useState(
    () => database.props.find((prop) => prop.type === 'select')?.id || ''
  );
  const [groupAnchor, setGroupAnchor] = useState<HTMLElement | null>(null);

  const [addPropOpen, setAddPropOpen] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<PropType>('text');
  const [propBusy, setPropBusy] = useState(false);

  const [propMenu, setPropMenu] = useState<{ prop: DbProp; anchor: HTMLElement } | null>(null);
  const [propNameDraft, setPropNameDraft] = useState('');

  const [selectMenu, setSelectMenu] = useState<{
    rowId: string;
    prop: DbProp;
    anchor: HTMLElement;
  } | null>(null);
  const [optionQuery, setOptionQuery] = useState('');

  const [rowDetailId, setRowDetailId] = useState<string | null>(null);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const pending = useRef(
    new Map<string, { timer: number; title?: string; props: Record<string, unknown> }>()
  );

  useEffect(() => {
    const queue = pending.current;
    return () => {
      for (const [id, entry] of queue.entries()) {
        window.clearTimeout(entry.timer);
        api.updateRow(id, { title: entry.title, props: entry.props }).catch(() => {});
      }
      queue.clear();
    };
  }, []);

  useEffect(() => {
    if (!focusRowId) return;
    const timeout = window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-row-id="${focusRowId}"] .db-title-input`
      );
      el?.focus();
      setFocusRowId(null);
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [focusRowId, rows]);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [searchOpen]);

  const queueRowSave = (
    rowId: string,
    patch: { title?: string; props?: Record<string, unknown> }
  ) => {
    const existing = pending.current.get(rowId);
    if (existing) window.clearTimeout(existing.timer);
    const merged = {
      title: patch.title ?? existing?.title,
      props: { ...(existing?.props || {}), ...(patch.props || {}) },
      timer: 0,
    };
    merged.timer = window.setTimeout(() => {
      pending.current.delete(rowId);
      api
        .updateRow(rowId, { title: merged.title, props: merged.props })
        .catch((error) =>
          toast(error instanceof Error ? error.message : 'Could not save the row.', 'error')
        );
    }, 450);
    pending.current.set(rowId, merged);
  };

  const updateTitle = (rowId: string, title: string) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, title } : row)));
    queueRowSave(rowId, { title });
  };

  const updateCell = (rowId: string, propId: string, value: unknown) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, props: { ...row.props, [propId]: value } }
          : row
      )
    );
    queueRowSave(rowId, { props: { [propId]: value } });
  };

  const addRow = async (title = '', initialProps: Record<string, unknown> = {}) => {
    try {
      const { row } = await api.addRow(page.id, title);
      let newRow = row;
      if (Object.keys(initialProps).length) {
        const response = await api.updateRow(row.id, { props: initialProps });
        newRow = response.row;
      }
      setRows((current) => [...current, newRow]);
      setFocusRowId(newRow.id);
      return newRow;
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add a row.', 'error');
      return null;
    }
  };

  const deleteRow = async (rowId: string) => {
    const row = rows.find((item) => item.id === rowId);
    const ok = await confirm({
      title: 'Delete this row?',
      message: row?.title ? `“${row.title}” will be deleted permanently.` : 'This row will be deleted permanently.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteRow(rowId);
      setRows((current) => current.filter((item) => item.id !== rowId));
      setRowDetailId(null);
      toast('Row deleted');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete the row.', 'error');
    }
  };

  const addProperty = async () => {
    const name = newPropName.trim();
    if (!name) return;
    setPropBusy(true);
    try {
      const { prop } = await api.addProp(page.id, name, newPropType);
      setProperties((current) => [...current, prop]);
      setAddPropOpen(false);
      setNewPropName('');
      setNewPropType('text');
      toast(`Added “${name}”`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add the property.', 'error');
    } finally {
      setPropBusy(false);
    }
  };

  const renameProperty = async (prop: DbProp, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === prop.name) return;
    try {
      const { prop: updated } = await api.updateProp(prop.id, { name: trimmed });
      setProperties((current) => current.map((item) => (item.id === prop.id ? updated : item)));
      setPropMenu(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not rename the property.', 'error');
    }
  };

  const deleteProperty = async (prop: DbProp) => {
    const ok = await confirm({
      title: `Delete “${prop.name}”?`,
      message: 'Every cell in this column will be removed. This cannot be undone.',
      confirmLabel: 'Delete property',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteProp(prop.id);
      setProperties((current) => current.filter((item) => item.id !== prop.id));
      setRows((current) =>
        current.map((row) => {
          const nextProps = { ...row.props };
          delete nextProps[prop.id];
          return { ...row, props: nextProps };
        })
      );
      setPropMenu(null);
      setSelectMenu(null);
      toast('Property deleted');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete the property.', 'error');
    }
  };

  const createOption = async (prop: DbProp, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (prop.options.some((option) => option.name === trimmed)) return trimmed;
    const color = SELECT_COLORS[prop.options.length % SELECT_COLORS.length];
    try {
      const { prop: updated } = await api.updateProp(prop.id, {
        options: [...prop.options, { name: trimmed, color }],
      });
      setProperties((current) => current.map((item) => (item.id === prop.id ? updated : item)));
      return trimmed;
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create the option.', 'error');
      return null;
    }
  };

  const chooseOption = async (prop: DbProp, name: string) => {
    if (!selectMenu) return;
    const row = rows.find((item) => item.id === selectMenu.rowId);
    if (!row) return;
    let value: string | string[];
    if (prop.type === 'multi_select') {
      const current = Array.isArray(row.props[prop.id]) ? (row.props[prop.id] as string[]) : [];
      value = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
      updateCell(row.id, prop.id, value);
    } else {
      value = name;
      updateCell(row.id, prop.id, value);
      setSelectMenu(null);
    }
    setOptionQuery('');
  };

  const applySort = (propId: string) => {
    setSort((current) =>
      current?.propId === propId
        ? current.dir === 'asc'
          ? { propId, dir: 'desc' }
          : null
        : { propId, dir: 'asc' }
    );
  };

  const filteredRows = rows.filter((row) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    if ((row.title || '').toLowerCase().includes(query)) return true;
    return properties.some((prop) =>
      stringValue(row.props[prop.id]).toLowerCase().includes(query)
    );
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sort) return 0;
    const { propId, dir } = sort;
    const av = propId === 'title' ? a.title : a.props[propId];
    const bv = propId === 'title' ? b.title : b.props[propId];
    if (av == null || av === '') return 1;
    if (bv == null || bv === '') return -1;
    let result: number;
    if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
    else if (typeof av === 'boolean' && typeof bv === 'boolean') result = Number(av) - Number(bv);
    else result = stringValue(av).localeCompare(stringValue(bv), undefined, { numeric: true });
    return dir === 'asc' ? result : -result;
  });

  const groupProp = properties.find((prop) => prop.id === groupPropId);
  const selectProps = properties.filter(
    (prop) => prop.type === 'select' || prop.type === 'multi_select'
  );

  const boardGroups = (() => {
    if (!groupProp) return [{ key: '', label: 'All rows', color: 'gray', rows: sortedRows }];
    const groups = groupProp.options.map((option) => ({
      key: option.name,
      label: option.name,
      color: option.color,
      rows: [] as DbRow[],
    }));
    const noValue = { key: '', label: 'No value', color: 'gray', rows: [] as DbRow[] };
    for (const row of sortedRows) {
      const raw = row.props[groupProp.id];
      const value = Array.isArray(raw) ? raw[0] : raw;
      const name = value == null ? '' : String(value);
      const group = groups.find((item) => item.key === name);
      if (group) group.rows.push(row);
      else if (name) {
        groups.push({ key: name, label: name, color: 'gray', rows: [row] });
      } else {
        noValue.rows.push(row);
      }
    }
    if (noValue.rows.length) groups.push(noValue);
    return groups;
  })();

  const rowDetail = rows.find((row) => row.id === rowDetailId);

  const renderCell = (row: DbRow, prop: DbProp) => {
    const value = row.props[prop.id];

    if (prop.type === 'checkbox') {
      return (
        <button
          className={cn('db-checkbox', !!value && 'checked')}
          role="checkbox"
          aria-checked={!!value}
          onClick={() => updateCell(row.id, prop.id, !value)}
        >
          {value ? <Check size={12} strokeWidth={3} /> : null}
        </button>
      );
    }

    if (prop.type === 'select' || prop.type === 'multi_select') {
      const values = prop.type === 'multi_select' ? (Array.isArray(value) ? value : []) : value ? [value] : [];
      return (
        <button
          className="db-cell-select"
          onClick={(event) =>
            setSelectMenu({ rowId: row.id, prop, anchor: event.currentTarget })
          }
        >
          {values.length ? (
            <span className="db-chip-row">
              {values.map((name) => (
                <Chip key={String(name)} name={String(name)} color={optionColor(prop, String(name))} />
              ))}
            </span>
          ) : (
            <span className="db-cell-placeholder">+</span>
          )}
        </button>
      );
    }

    if (prop.type === 'date') {
      return (
        <input
          className="db-cell-input db-date-input"
          type="date"
          value={stringValue(value).slice(0, 10)}
          onChange={(event) => updateCell(row.id, prop.id, event.target.value)}
        />
      );
    }

    if (prop.type === 'number') {
      return (
        <input
          className="db-cell-input"
          type="number"
          value={value == null || value === '' ? '' : String(value)}
          placeholder="0"
          onChange={(event) => {
            const next = event.target.value;
            updateCell(row.id, prop.id, next === '' ? '' : Number(next));
          }}
        />
      );
    }

    if (prop.type === 'url') {
      return (
        <div className="db-url-cell">
          <input
            className="db-cell-input"
            value={stringValue(value)}
            placeholder="https://…"
            onChange={(event) => updateCell(row.id, prop.id, event.target.value)}
          />
          {typeof value === 'string' && /^https?:\/\//i.test(value) ? (
            <a href={value} target="_blank" rel="noopener noreferrer" title="Open link">
              <Link2 size={13} />
            </a>
          ) : null}
        </div>
      );
    }

    return (
      <input
        className="db-cell-input"
        value={stringValue(value)}
        placeholder="Empty"
        onChange={(event) => updateCell(row.id, prop.id, event.target.value)}
      />
    );
  };

  return (
    <div className="database">
      <div className="db-toolbar">
        <div className="db-view-switch">
          <button
            className={cn(view === 'table' && 'active')}
            onClick={() => setView('table')}
            title="Table view"
          >
            <Table2 size={14} /> Table
          </button>
          <button
            className={cn(view === 'board' && 'active')}
            onClick={() => setView('board')}
            title="Board view"
          >
            <LayoutGrid size={14} /> Board
          </button>
        </div>

        <div className="db-toolbar-actions">
          {searchOpen ? (
            <div className="db-search">
              <Search size={14} />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rows…"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearch('');
                    setSearchOpen(false);
                  }
                }}
              />
              <button
                className="icon-btn tiny"
                onClick={() => {
                  setSearch('');
                  setSearchOpen(false);
                }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button className="db-tool" onClick={() => setSearchOpen(true)}>
              <Search size={14} /> <span>Search</span>
            </button>
          )}

          <button
            className={cn('db-tool', sort && 'active')}
            onClick={(event) => setSortAnchor(event.currentTarget)}
          >
            <ArrowUpDown size={14} />
            <span>{sort ? (sort.dir === 'asc' ? 'Sorted ↑' : 'Sorted ↓') : 'Sort'}</span>
          </button>

          {view === 'board' && (
            <button
              className={cn('db-tool', groupProp && 'active')}
              onClick={(event) => setGroupAnchor(event.currentTarget)}
            >
              <LayoutGrid size={14} />
              <span>{groupProp ? `Group: ${groupProp.name}` : 'Group'}</span>
            </button>
          )}

          <button className="db-tool" onClick={() => setAddPropOpen(true)}>
            <Plus size={14} />
            <span>Property</span>
          </button>

          <button className="btn primary small db-new-button" onClick={() => addRow()}>
            <Plus size={15} /> New
          </button>
        </div>
      </div>

      {view === 'table' ? (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                <th className="db-title-th">
                  <button
                    className="db-th-button"
                    onClick={() => applySort('title')}
                    title="Sort by name"
                  >
                    Name
                    {sort?.propId === 'title' && (
                      sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    )}
                  </button>
                </th>
                {properties.map((prop) => (
                  <th key={prop.id}>
                    <button
                      className="db-th-button"
                      onClick={(event) => {
                        setPropNameDraft(prop.name);
                        setPropMenu({ prop, anchor: event.currentTarget });
                      }}
                    >
                      <span className="db-th-type-icon">
                        {PROP_TYPES.find((item) => item.type === prop.type)?.icon}
                      </span>
                      <span>{prop.name}</span>
                      {sort?.propId === prop.id && (
                        sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      )}
                    </button>
                  </th>
                ))}
                <th className="db-add-th">
                  <button
                    className="icon-btn tiny"
                    title="Add a property"
                    onClick={() => setAddPropOpen(true)}
                  >
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} data-row-id={row.id}>
                  <td className="db-title-cell">
                    <div className="db-title-inner">
                      <input
                        className="db-title-input"
                        value={row.title}
                        placeholder="Untitled"
                        onChange={(event) => updateTitle(row.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            setRowDetailId(row.id);
                          }
                        }}
                      />
                      <button
                        className="db-open-row"
                        title="Open row"
                        onClick={() => setRowDetailId(row.id)}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                  </td>
                  {properties.map((prop) => (
                    <td key={prop.id}>{renderCell(row, prop)}</td>
                  ))}
                  <td className="db-row-menu-cell">
                    <button
                      className="icon-btn tiny db-row-menu"
                      title="Row options"
                      onClick={() => setRowDetailId(row.id)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedRows.length === 0 && (
            <div className="db-empty">
              <div className="db-empty-icon">📋</div>
              <h3>{search ? 'No matching rows' : 'No rows yet'}</h3>
              <p>{search ? 'Try a different search.' : 'Add your first row to get started.'}</p>
              {!search && (
                <button className="btn primary small" onClick={() => addRow()}>
                  <Plus size={14} /> New row
                </button>
              )}
            </div>
          )}

          <button className="db-add-row" onClick={() => addRow()}>
            <Plus size={14} /> New row
          </button>
          <div className="db-table-footer">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
            {search && ` · ${sortedRows.length} matching`}
          </div>
        </div>
      ) : (
        <div className="db-board-wrap">
          {!groupProp && (
            <div className="db-board-hint">
              <LayoutGrid size={14} /> Add a select property to group this board.
            </div>
          )}
          <div className="db-board">
            {boardGroups.map((group) => (
              <div
                key={group.key || 'none'}
                className={cn('db-board-column', dropColumn === (group.key || 'none') && 'drop-active')}
                onDragOver={(event) => {
                  if (!draggingRowId) return;
                  event.preventDefault();
                  setDropColumn(group.key || 'none');
                }}
                onDragLeave={() => setDropColumn(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingRowId || !groupProp) return;
                  const row = rows.find((item) => item.id === draggingRowId);
                  if (row) {
                    const value =
                      groupProp.type === 'multi_select'
                        ? group.key
                          ? [group.key]
                          : []
                        : group.key;
                    updateCell(row.id, groupProp.id, value);
                  }
                  setDraggingRowId(null);
                  setDropColumn(null);
                }}
              >
                <div className="db-board-header">
                  <Chip name={group.label} color={group.color} />
                  <span className="db-board-count">{group.rows.length}</span>
                </div>
                <div className="db-board-cards">
                  {group.rows.map((row) => (
                    <button
                      key={row.id}
                      className="db-card"
                      draggable
                      onDragStart={(event) => {
                        setDraggingRowId(row.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', row.id);
                      }}
                      onDragEnd={() => {
                        setDraggingRowId(null);
                        setDropColumn(null);
                      }}
                      onClick={() => setRowDetailId(row.id)}
                    >
                      <span className="db-card-title">{row.title || 'Untitled'}</span>
                      <span className="db-card-props">
                        {properties
                          .filter((prop) => prop.id !== groupProp?.id)
                          .map((prop) => ({ prop, value: row.props[prop.id] }))
                          .filter(({ value }) => value != null && value !== '' && value !== false)
                          .slice(0, 3)
                          .map(({ prop, value }) =>
                            prop.type === 'select' ? (
                              <Chip
                                key={prop.id}
                                name={String(value)}
                                color={optionColor(prop, String(value))}
                              />
                            ) : prop.type === 'checkbox' ? (
                              <span key={prop.id} className="db-card-meta">
                                <CheckSquare size={12} /> {prop.name}
                              </span>
                            ) : prop.type === 'date' ? (
                              <span key={prop.id} className="db-card-meta">
                                <CalendarDays size={12} /> {formatDate(String(value))}
                              </span>
                            ) : (
                              <span key={prop.id} className="db-card-meta">
                                {truncate(stringValue(value), 40)}
                              </span>
                            )
                          )}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  className="db-board-add"
                  onClick={async () => {
                    if (!groupProp) {
                      addRow();
                      return;
                    }
                    const newRow = await addRow('', {
                      [groupProp.id]: group.key || '',
                    });
                    if (newRow) setRowDetailId(newRow.id);
                  }}
                >
                  <Plus size={14} /> New
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Popover
        open={!!sortAnchor}
        anchor={sortAnchor}
        onClose={() => setSortAnchor(null)}
        className="menu"
        minWidth={220}
      >
        <MenuLabel>Sort by</MenuLabel>
        <button className="menu-item" onClick={() => { applySort('title'); setSortAnchor(null); }}>
          <span className="menu-icon"><Type size={15} /></span>
          <span className="menu-label">Name</span>
          {sort?.propId === 'title' && <span className="menu-shortcut">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
        </button>
        {selectProps.map((prop) => (
          <button
            key={prop.id}
            className="menu-item"
            onClick={() => {
              applySort(prop.id);
              setSortAnchor(null);
            }}
          >
            <span className="menu-icon">
              {PROP_TYPES.find((item) => item.type === prop.type)?.icon}
            </span>
            <span className="menu-label">{prop.name}</span>
            {sort?.propId === prop.id && <span className="menu-shortcut">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
          </button>
        ))}
        {properties
          .filter((prop) => !selectProps.some((item) => item.id === prop.id))
          .map((prop) => (
            <button
              key={prop.id}
              className="menu-item"
              onClick={() => {
                applySort(prop.id);
                setSortAnchor(null);
              }}
            >
              <span className="menu-icon">
                {PROP_TYPES.find((item) => item.type === prop.type)?.icon}
              </span>
              <span className="menu-label">{prop.name}</span>
              {sort?.propId === prop.id && <span className="menu-shortcut">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
        {sort && (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<X size={15} />}
              label="Clear sort"
              onClick={() => {
                setSort(null);
                setSortAnchor(null);
              }}
            />
          </>
        )}
      </Popover>

      <Popover
        open={!!groupAnchor}
        anchor={groupAnchor}
        onClose={() => setGroupAnchor(null)}
        className="menu"
        minWidth={220}
      >
        <MenuLabel>Group by</MenuLabel>
        {selectProps.length === 0 && (
          <div className="menu-empty">Add a select property first.</div>
        )}
        {selectProps.map((prop) => (
          <MenuItem
            key={prop.id}
            label={prop.name}
            trailing={groupPropId === prop.id ? <Check size={14} /> : undefined}
            onClick={() => {
              setGroupPropId(prop.id);
              setGroupAnchor(null);
            }}
          />
        ))}
      </Popover>

      <Popover
        open={!!propMenu}
        anchor={propMenu?.anchor || null}
        onClose={() => setPropMenu(null)}
        className="menu prop-menu"
        minWidth={240}
      >
        {propMenu && (
          <>
            <MenuLabel>Property</MenuLabel>
            <div className="prop-rename">
              <input
                className="text-input small"
                value={propNameDraft}
                autoFocus
                onChange={(event) => setPropNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') renameProperty(propMenu.prop, propNameDraft);
                  if (event.key === 'Escape') setPropMenu(null);
                }}
                onBlur={() => renameProperty(propMenu.prop, propNameDraft)}
              />
            </div>
            <MenuSeparator />
            <MenuItem
              icon={<ArrowUp size={15} />}
              label="Sort ascending"
              onClick={() => {
                setSort({ propId: propMenu.prop.id, dir: 'asc' });
                setPropMenu(null);
              }}
            />
            <MenuItem
              icon={<ArrowDown size={15} />}
              label="Sort descending"
              onClick={() => {
                setSort({ propId: propMenu.prop.id, dir: 'desc' });
                setPropMenu(null);
              }}
            />
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 size={15} />}
              label="Delete property"
              danger
              onClick={() => deleteProperty(propMenu.prop)}
            />
          </>
        )}
      </Popover>

      <Popover
        open={!!selectMenu}
        anchor={selectMenu?.anchor || null}
        onClose={() => {
          setSelectMenu(null);
          setOptionQuery('');
        }}
        className="select-menu"
        minWidth={220}
      >
        {selectMenu && (
          <div className="select-menu-content">
            <input
              className="text-input small"
              value={optionQuery}
              onChange={(event) => setOptionQuery(event.target.value)}
              placeholder="Search or create an option…"
              autoFocus
              onKeyDown={async (event) => {
                if (event.key === 'Enter' && optionQuery.trim()) {
                  const name = await createOption(selectMenu.prop, optionQuery);
                  if (name) chooseOption(selectMenu.prop, name);
                }
                if (event.key === 'Escape') setSelectMenu(null);
              }}
            />
            <div className="select-options">
              {selectMenu.prop.options
                .filter((option) =>
                  option.name.toLowerCase().includes(optionQuery.toLowerCase())
                )
                .map((option) => {
                  const row = rows.find((item) => item.id === selectMenu.rowId);
                  const raw = row?.props[selectMenu.prop.id];
                  const selected = Array.isArray(raw)
                    ? raw.map(String).includes(option.name)
                    : raw === option.name;
                  return (
                    <button
                      key={option.id}
                      className="select-option"
                      onClick={() => chooseOption(selectMenu.prop, option.name)}
                    >
                      <Chip name={option.name} color={option.color} />
                      {selected && <Check size={14} />}
                    </button>
                  );
                })}
              {optionQuery.trim() &&
                !selectMenu.prop.options.some(
                  (option) => option.name.toLowerCase() === optionQuery.trim().toLowerCase()
                ) && (
                  <button
                    className="select-option create"
                    onClick={async () => {
                      const name = await createOption(selectMenu.prop, optionQuery);
                      if (name) chooseOption(selectMenu.prop, name);
                    }}
                  >
                    <Plus size={14} /> Create “{optionQuery.trim()}”
                  </button>
                )}
              {!optionQuery.trim() && (
                <div className="select-empty">Type to search or create an option</div>
              )}
            </div>
            {selectMenu.prop.type === 'select' && selectMenu.prop.options.length > 0 && (
              <>
                <MenuSeparator />
                <button
                  className="select-option remove"
                  onClick={() => {
                    if (!selectMenu) return;
                    updateCell(selectMenu.rowId, selectMenu.prop.id, '');
                    setSelectMenu(null);
                  }}
                >
                  <X size={14} /> Clear value
                </button>
              </>
            )}
          </div>
        )}
      </Popover>

      <Modal
        open={addPropOpen}
        onClose={() => setAddPropOpen(false)}
        width={520}
        className="add-prop-modal"
      >
        <div className="add-prop-content">
          <h2>Add a property</h2>
          <input
            className="text-input"
            value={newPropName}
            onChange={(event) => setNewPropName(event.target.value)}
            placeholder="Property name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') addProperty();
            }}
          />
          <div className="prop-type-grid">
            {PROP_TYPES.map((type) => (
              <button
                key={type.type}
                className={cn('prop-type-card', newPropType === type.type && 'active')}
                onClick={() => setNewPropType(type.type)}
              >
                <span className="prop-type-icon">{type.icon}</span>
                <span>
                  <strong>{type.label}</strong>
                  <small>{type.hint}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setAddPropOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={addProperty} disabled={!newPropName.trim() || propBusy}>
              {propBusy && <Loader2 size={14} className="spin" />} Add property
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!rowDetail}
        onClose={() => setRowDetailId(null)}
        width={660}
        className="row-modal"
      >
        {rowDetail && (
          <div className="row-detail">
            <input
              className="row-detail-title"
              value={rowDetail.title}
              placeholder="Untitled"
              onChange={(event) => updateTitle(rowDetail.id, event.target.value)}
            />
            <div className="row-detail-meta">
              Created {relativeTime(rowDetail.createdAt)} · Edited {relativeTime(rowDetail.updatedAt)}
            </div>
            <div className="row-properties">
              {properties.map((prop) => (
                <div className="row-property" key={prop.id}>
                  <div className="row-property-label">
                    <span className="db-th-type-icon">
                      {PROP_TYPES.find((item) => item.type === prop.type)?.icon}
                    </span>
                    {prop.name}
                  </div>
                  <div className="row-property-value">{renderCell(rowDetail, prop)}</div>
                </div>
              ))}
              {properties.length === 0 && (
                <div className="row-no-props">No properties yet.</div>
              )}
            </div>
            <div className="row-detail-actions">
              <button
                className="btn ghost danger-text"
                onClick={() => deleteRow(rowDetail.id)}
              >
                <Trash2 size={14} /> Delete row
              </button>
              <button className="btn primary small" onClick={() => setRowDetailId(null)}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
