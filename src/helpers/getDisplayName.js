import { decode } from 'punycode';

export function getDisplayName(str) {
  let ret = str;
  try {
    ret = decode(str);
  } catch (err) {
    // pass
  }

  return ret || 'Untitled';
}
