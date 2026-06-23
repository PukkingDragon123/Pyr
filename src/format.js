// Number + time formatting for an incremental game (short scale → scientific).
const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc",
  "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"];

export function fmt(n) {
  if (n === Infinity) return "∞";
  if (n == null || isNaN(n)) return "0";
  const neg = n < 0; n = Math.abs(n);
  if (n < 1000) {
    if (n === 0) return "0";
    if (n < 10) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
    return (neg ? "-" : "") + Math.floor(n).toString();
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIX.length) {
    const scaled = n / Math.pow(1000, tier);
    const s = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2).replace(/\.?0+$/, "");
    return (neg ? "-" : "") + s + SUFFIX[tier];
  }
  // beyond named tiers → scientific
  const exp = Math.floor(Math.log10(n));
  const mant = (n / Math.pow(10, exp)).toFixed(2);
  return (neg ? "-" : "") + mant + "e" + exp;
}

export function fmtInt(n) {
  if (n < 1e6) return Math.floor(n).toLocaleString("en-US");
  return fmt(n);
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}
