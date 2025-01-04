import { at } from "es-toolkit";
import { sum } from "es-toolkit";

const numbers = [10, 20, 30, 40, 50];
trace(`${at(numbers, [1, 3, 4]).toString()}\n`);

trace(`${sum(numbers)}\n`);
