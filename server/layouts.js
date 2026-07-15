const MAX_TABLES = 20;

export function parseLayout(value) {
  if (!value) return [];
  let rows;
  try {
    rows = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_TABLES).flatMap((row, index) => {
    const capacity = Number(row?.capacity);
    const x = Number(row?.x);
    const y = Number(row?.y);
    const rot = Number(row?.rot);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8) return [];
    if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) return [];
    if (rot !== 0 && rot !== 90) return [];
    const label = String(row?.label ?? `T${index + 1}`).trim().slice(0, 20) || `T${index + 1}`;
    return [{ label, capacity, x, y, rot }];
  });
}

export function snapshotLayout(tables) {
  const active = tables.filter((table) => !table.released && !table.stolen);
  if (active.length === 0) return null;
  return JSON.stringify(active.map((table) => ({
    label: table.label,
    capacity: table.capacity,
    x: table.x,
    y: table.y,
    rot: table.rot,
  })));
}

export function layoutSummary(value) {
  const tables = parseLayout(value);
  if (tables.length === 0) return null;
  return {
    tableCount: tables.length,
    totalSeats: tables.reduce((sum, table) => sum + table.capacity, 0),
  };
}
