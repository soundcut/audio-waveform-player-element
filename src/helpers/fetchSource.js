export async function fetchSource(url) {
  const fetchPromise = fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'audio/*',
    },
  });

  try {
    const response = await fetchPromise;
    if (response) {
      if (response.status !== 200) {
        const error = new Error('Unable to fetch source');
        error.response = response;
        throw error;
      }
    }

    const blob = await response.blob();
    let filename = 'Untitled';
    try {
      filename = response.headers
        .get('content-disposition')
        .match(/filename="(.+)"/)[1];
    } catch (err) {
      // pass
    }
    return new File([blob], filename, {
      type: (response.headers.get('content-type') || '').split(';')[0],
    });
  } catch (err) {
    console.error({ err });
    throw err;
  }
}
