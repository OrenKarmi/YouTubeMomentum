function triggerBackgroundRefresh(runAutoRefreshCycle, onBackgroundRefreshError = () => {}) {
  Promise.resolve()
    .then(() => runAutoRefreshCycle())
    .catch((error) => {
      onBackgroundRefreshError(error);
    });
}

async function updateAutoRefreshMode(mode, dependencies) {
  const profile = dependencies.applyAutoRefreshMode(mode);
  dependencies.scheduleAutoRefreshTimer();
  await dependencies.saveAutoRefreshMode(profile.mode);

  const response = dependencies.buildRefreshSettingsResponse(profile.mode);
  triggerBackgroundRefresh(dependencies.runAutoRefreshCycle, dependencies.onBackgroundRefreshError);

  return response;
}

module.exports = {
  triggerBackgroundRefresh,
  updateAutoRefreshMode,
};