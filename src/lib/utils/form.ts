export function getDirtyFields(
  dirtyFields: Record<string, any>,
  formValues: Record<string, any>,
): Record<string, any> {
  if (
    typeof dirtyFields !== "object" ||
    dirtyFields === null ||
    !formValues
  ) {
    return {};
  }

  return Object.keys(dirtyFields).reduce(
    (accumulator: Record<string, any>, key) => {
      const isDirty = dirtyFields[key];
      const value = formValues[key];

      // If it's an array, apply the logic recursively to each item
      if (Array.isArray(isDirty)) {
        const _dirtyFields = isDirty.map((item, index) =>
          getDirtyFields(item, value[index])
        );
        if (_dirtyFields.length > 0) {
          accumulator[key] = _dirtyFields;
        }
      } // If it's an object, apply the logic recursively
      else if (typeof isDirty === "object" && isDirty !== null) {
        accumulator[key] = getDirtyFields(isDirty, value);
      } // If it's a dirty field, get the value from formValues
      else if (isDirty) {
        accumulator[key] = value;
      }

      return accumulator;
    },
    {},
  );
}
