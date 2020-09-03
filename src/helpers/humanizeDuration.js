export function humanizeDuration(duration, progress = null) {
  const dHumanized = [
    [Math.floor((duration % 3600) / 60), 'minute|s'],
    [('00' + Math.floor(duration % 60)).slice(-2), 'second|s'],
  ]
    .reduce((acc, curr) => {
      const parsed = Number.parseInt(curr);
      if (parsed) {
        acc.push(
          [
            curr[0],
            parsed > 1 ? curr[1].replace('|', '') : curr[1].split('|')[0],
          ].join(' ')
        );
      }
      return acc;
    }, [])
    .join(', ');

  if (Number.isNaN(Number.parseInt(progress))) {
    return dHumanized;
  }

  const pHumanized = `${progress}%`;
  return `${dHumanized} (${pHumanized})`;
}
