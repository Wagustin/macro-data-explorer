/**
 * Helper fetch with default timeout using AbortSignal.timeout
 * @param {string|URL|Request} url
 * @param {RequestInit} [opts]
 * @param {number} [ms=20000]
 * @returns {Promise<Response>}
 */
export async function fetchT(url, opts = {}, ms = 20000) {
  const timeoutSignal = AbortSignal.timeout(ms);
  let signal = timeoutSignal;
  if (opts && opts.signal) {
    signal = typeof AbortSignal.any === "function"
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : opts.signal;
  }
  return fetch(url, { ...opts, signal });
}

export default fetchT;
