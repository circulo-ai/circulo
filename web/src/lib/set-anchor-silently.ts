export function setAnchorSilently(id: string) {
  const hash = id.startsWith("#") ? id : `#${id}`;
  const { pathname, search } = window.location;
  history.replaceState(null, "", `${pathname}${search}${hash}`);
}
