import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

/**
 * Runs a request when the component mounts (and whenever `deps` change) and
 * hands back the three states every screen needs: loading, error, data.
 *
 * `reload` re-runs it — used after registering or scanning so the numbers on
 * screen come from the database rather than from a guess.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  // The fetcher is defined inline by callers, so it is new on every render;
  // the caller's deps decide when it should actually run again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await run();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error:
          error instanceof ApiError
            ? error
            : new ApiError('Something went wrong.', 0, 'unknown_error'),
      });
    }
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load, setData: (data: T) => setState({ data, loading: false, error: null }) };
}
