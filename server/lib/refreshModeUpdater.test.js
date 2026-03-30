const test = require('node:test');
const assert = require('node:assert/strict');

const { triggerBackgroundRefresh, updateAutoRefreshMode } = require('./refreshModeUpdater');

test('updateAutoRefreshMode returns after save without waiting for the refresh cycle', async () => {
  const calls = [];
  let releaseRun;

  const result = await Promise.race([
    updateAutoRefreshMode('1m', {
      applyAutoRefreshMode(mode) {
        calls.push(`apply:${mode}`);
        return { mode };
      },
      scheduleAutoRefreshTimer() {
        calls.push('schedule');
      },
      async saveAutoRefreshMode(mode) {
        calls.push(`save:${mode}`);
      },
      runAutoRefreshCycle() {
        calls.push('run');
        return new Promise((resolve) => {
          releaseRun = resolve;
        });
      },
      buildRefreshSettingsResponse(mode) {
        calls.push(`build:${mode}`);
        return { mode };
      },
      onBackgroundRefreshError() {
        calls.push('error');
      },
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('settings response timed out')), 50);
    }),
  ]);

  assert.deepEqual(result, { mode: '1m' });
  assert.deepEqual(calls.slice(0, 4), ['apply:1m', 'schedule', 'save:1m', 'build:1m']);

  await Promise.resolve();
  assert.ok(calls.includes('run'));

  releaseRun();
});

test('triggerBackgroundRefresh forwards rejected refreshes to the error handler', async () => {
  let capturedError = '';

  triggerBackgroundRefresh(
    async () => {
      throw new Error('boom');
    },
    (error) => {
      capturedError = error.message;
    },
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  assert.equal(capturedError, 'boom');
});