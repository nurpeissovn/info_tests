const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function parseJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export async function fetchRemoteResults() {
  const data = await request("/results");
  return {
    records: Array.isArray(data.records) ? data.records : [],
    source: data.source || "remote"
  };
}

export async function saveRemoteResult(record) {
  const data = await request("/results", {
    method: "POST",
    body: JSON.stringify(record)
  });

  return data.record || record;
}

export async function fetchApiHealth() {
  return request("/health");
}
