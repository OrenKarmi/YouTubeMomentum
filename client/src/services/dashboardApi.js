export async function fetchDashboard(filters, options = {}) {
  const params = new URLSearchParams(filters);

  if (options.force) {
    params.set('force', '1');
  }

  const response = await fetch(`/api/dashboard?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchRefreshSettings() {
  const response = await fetch('/api/settings/refresh');

  if (!response.ok) {
    throw new Error(`Refresh settings request failed with status ${response.status}`);
  }

  return response.json();
}

export async function updateRefreshSettings(mode) {
  const response = await fetch('/api/settings/refresh', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  });

  if (!response.ok) {
    throw new Error(`Refresh settings update failed with status ${response.status}`);
  }

  return response.json();
}