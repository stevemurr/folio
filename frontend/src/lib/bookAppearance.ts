const BOOK_ACCENTS = [
  { color: "hsl(var(--chart-rust))", ring: "rgba(242,139,61,0.22)", wash: "rgba(242,139,61,0.08)" },
  { color: "hsl(var(--chart-teal))", ring: "rgba(93,215,224,0.22)", wash: "rgba(93,215,224,0.08)" },
  { color: "hsl(var(--chart-gold))", ring: "rgba(215,181,82,0.24)", wash: "rgba(215,181,82,0.09)" },
  { color: "hsl(var(--chart-sage))", ring: "rgba(131,186,131,0.24)", wash: "rgba(131,186,131,0.1)" },
  { color: "#9c7bf7", ring: "rgba(156,123,247,0.22)", wash: "rgba(156,123,247,0.08)" },
  { color: "#f87171", ring: "rgba(248,113,113,0.22)", wash: "rgba(248,113,113,0.08)" },
];

const BENCHMARK_ACCENTS = [
  "#6b7280",
  "#1d4ed8",
  "#0f766e",
  "#92400e",
  "#7c3aed",
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function bookAccent(bookId: string) {
  return BOOK_ACCENTS[hashString(bookId) % BOOK_ACCENTS.length];
}

export function benchmarkAccent(ticker: string) {
  return BENCHMARK_ACCENTS[hashString(ticker) % BENCHMARK_ACCENTS.length];
}
