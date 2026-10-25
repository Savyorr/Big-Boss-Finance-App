export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function monthEnd(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid month.");
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return `${month}-${[31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]}`;
}
export function reportingRangeIssue(from: string, to: string) {
  const valid = (v: string) =>
    /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(v) &&
    v.slice(8) >= "01" &&
    v <= monthEnd(v.slice(0, 7));
  if (!valid(from) || !valid(to) || from > to)
    return "Enter valid From and To dates with From on or before To.";
  const months =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7)) +
    1;
  if (months > 1200)
    return "Choose a reporting range of 100 years or less. No report has been truncated.";
  return "";
}
