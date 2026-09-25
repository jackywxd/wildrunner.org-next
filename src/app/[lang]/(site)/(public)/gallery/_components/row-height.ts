/**
 * A photo wall's target row height, scaled down for a phone.
 *
 * The walls asked for 220–350px rows at every width. In a 343px column that
 * is one picture per row for anything landscape and a portrait taller than
 * the screen — a wall of twenty photos became twenty screens of scrolling.
 * Below 600px of container the target drops to 140, which puts two or three
 * photos in most rows; above it the caller's number is used unchanged.
 */
const PHONE_CONTAINER = 600;
const PHONE_ROW_HEIGHT = 140;

export function responsiveRowHeight(target: number) {
  return (containerWidth: number) =>
    containerWidth < PHONE_CONTAINER ? Math.min(target, PHONE_ROW_HEIGHT) : target;
}
