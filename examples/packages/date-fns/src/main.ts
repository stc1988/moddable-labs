import { compareAsc, format } from "date-fns";

trace(`${format(new Date(2014, 1, 11), "yyyy-MM-dd")}\n`);

const dates = [
  new Date(1995, 6, 2),
  new Date(1987, 1, 11),
  new Date(1989, 6, 10),
];
const sorted = dates.sort(compareAsc);

for (const d of sorted) {
  trace(`${format(d, "yyyy-MM-dd")}\n`);
}
