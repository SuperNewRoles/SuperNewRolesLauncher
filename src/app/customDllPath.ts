export function pathBasename(path: string): string {
  return path.split(/[\\/]/u).pop() ?? "";
}

export function hasExpectedCustomDllFileName(
  selectedPath: string,
  targetRelativePath: string,
): boolean {
  const selectedName = pathBasename(selectedPath);
  const targetName = pathBasename(targetRelativePath);
  return (
    selectedName.length > 0 &&
    targetName.length > 0 &&
    selectedName.toLowerCase() === targetName.toLowerCase()
  );
}
