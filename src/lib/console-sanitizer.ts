// Console sanitization for production to avoid leaking sensitive data in browser console
// Behavior:
// - In development: no changes
// - In production: silence log/info/debug; keep warn minimal; sanitize error messages
// - Opt-in debug: set localStorage['nyanime.debug'] = '1' to restore normal logging

type AnyFn = (...args: unknown[]) => void;

const maskSensitive = (val: unknown): unknown => {
  if (typeof val === 'string') {
    // Mask URLs query strings and obvious tokens
    let out = val.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/gi, '$1?[redacted]');
    out = out.replace(/(authorization|token|cookie|cf_clearance|session|api[_-]?key)\s*[:=]\s*([^\s;,'"]+)/gi, '$1=[redacted]');
    // Truncate long strings
    if (out.length > 300) out = out.slice(0, 300) + '…';
    return out;
  }
  if (Array.isArray(val)) return val.map(maskSensitive);
  if (val && typeof val === 'object') {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (/(authorization|token|cookie|cf_clearance|session|api[_-]?key|headers)/.test(key)) {
        safe[k] = '[redacted]';
      } else if (typeof v === 'string') {
        safe[k] = maskSensitive(v);
      } else {
        safe[k] = v;
      }
    }
    return safe;
  }
  return val;
};

export const installConsoleSanitizer = (): void => {
  try {
    const isDev = import.meta.env.DEV;
    const debugEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('nyanime.debug') === '1';
    if (isDev || debugEnabled) return; // no changes in dev or explicit debug

    // Keep original refs
    const origLog = console.log.bind(console) as AnyFn;
    const origInfo = console.info.bind(console) as AnyFn;
    const origDebug = console.debug ? console.debug.bind(console) : origLog;
    const origWarn = console.warn.bind(console) as AnyFn;
    const origError = console.error.bind(console) as AnyFn;

    let warnedOnce = false;
    const announce = () => {
      if (!warnedOnce) {
        warnedOnce = true;
        origWarn('[client] logs are suppressed in production. Set localStorage["nyanime.debug"]="1" to enable.');
      }
    };

    // Silence noisy methods
    console.log = (..._args: unknown[]) => { announce(); };
    console.info = (..._args: unknown[]) => { announce(); };
  console.debug = ((..._args: unknown[]) => { announce(); }) as AnyFn;

    // Keep warnings minimal
    console.warn = (...args: unknown[]) => {
      try {
        const sanitized = args.map(maskSensitive);
        origWarn('[warn]', ...sanitized);
      } catch {
        origWarn('[warn]');
      }
    };

    // Keep errors but sanitize
    console.error = (...args: unknown[]) => {
      try {
        const sanitized = args.map(maskSensitive);
        origError('[error]', ...sanitized);
      } catch {
        origError('[error]');
      }
    };
  } catch {
    // Ignore any failures; better to leave console untouched than crash
  }
};

export default installConsoleSanitizer;
