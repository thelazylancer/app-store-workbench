import { readFileSync } from "node:fs";

import type { InputRow } from "./types";

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function readInputRows(path: string): InputRow[] {
  const [headerRow, ...dataRows] = parseCsv(readFileSync(path, "utf8"));
  const headers = (headerRow ?? []).map((header) => header.trim());
  const required = [
    "App团队",
    "首投日期",
    "包名",
    "搜索名",
    "pkg_name",
    "上架日期",
    "100+首日",
    "下架日期",
  ];

  for (const name of required) {
    if (!headers.includes(name)) {
      throw new Error(`Input CSV is missing required column: ${name}`);
    }
  }

  const valueAt = (row: string[], name: string) => row[headers.indexOf(name)] ?? "";

  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => ({
      team: valueAt(row, "App团队"),
      firstLaunchDate: valueAt(row, "首投日期"),
      packageName: valueAt(row, "包名"),
      searchName: valueAt(row, "搜索名"),
      pkgName: valueAt(row, "pkg_name"),
      listingDate: valueAt(row, "上架日期"),
      hundredFirstDay: valueAt(row, "100+首日"),
      delistingDate: valueAt(row, "下架日期"),
    }));
}

export function cacheFileName(row: InputRow, index: number, usedNames: Set<string>): string {
  const base =
    row.pkgName
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100) || "app";
  let name = `${base}.json`;

  if (usedNames.has(name)) {
    name = `${base}-${index + 1}.json`;
  }

  usedNames.add(name);
  return name;
}
