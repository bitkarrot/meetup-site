/**
 * Race a promise against a timeout.
 *
 * If the timeout fires first the returned promise rejects. The underlying
 * promise is not cancelled, but any late settlement is ignored so it cannot
 * cause unhandled rejections or keep the UI pending forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Operation timed out'): Promise<T> {
  let settled = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    }, ms);

    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}
