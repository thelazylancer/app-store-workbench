import { Button, Selector, Stack, TextInput } from "@astryxdesign/core";
import { useEffect, useRef } from "react";
import type { StoreCountry } from "../../shared/types";
import { COUNTRY_OPTIONS } from "./format";
import "./styles/composer.css";

export type QueryRow = {
  id: number;
  name: string;
  bundleId: string;
};

export type FocusRequest = { index: number; seq: number } | null;

export type Validation = {
  message: string;
  invalidIds: Set<number>;
};

type ComposerProps = {
  rows: QueryRow[];
  country: StoreCountry;
  open: boolean;
  validation: Validation | null;
  focusRequest: FocusRequest;
  onOpenChange: (open: boolean) => void;
  onCountryChange: (country: StoreCountry) => void;
  onRowChange: (id: number, field: "name" | "bundleId", value: string) => void;
  onAddRow: () => void;
  onRemoveRow: (id: number) => void;
  onSearch: () => void;
  onClear: () => void;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="15" height="15">
      <circle cx="8.5" cy="8.5" r="4.75" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M5 5L15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="14" height="14">
      <path d="M5 5L15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Composer({
  rows,
  country,
  open,
  validation,
  focusRequest,
  onOpenChange,
  onCountryChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onSearch,
  onClear,
}: ComposerProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (focusRequest) {
      nameRefs.current[focusRequest.index]?.focus();
    }
  }, [focusRequest]);

  const activeRows = rows.filter((row) => row.name.trim() || row.bundleId.trim());
  const nameCount = rows.filter((row) => row.name.trim()).length;
  const countryLabel = country.toUpperCase();
  const context =
    activeRows.length === 0
      ? `${countryLabel} 区`
      : `${activeRows.length} ${activeRows.length === nameCount ? "个应用名称" : "个查询"} · ${countryLabel} 区`;

  function handleSearchClick() {
    if (detailsRef.current?.contains(document.activeElement)) {
      summaryRef.current?.focus();
    }
    onSearch();
  }

  return (
    <details
      ref={detailsRef}
      className="wx-search-composer"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary ref={summaryRef} className="wx-composer-summary">
        <span className="wx-composer-context" data-role="composer-context">
          {context}
        </span>
        <span className="wx-region" data-role="country-code" aria-label="当前商店区域">
          {countryLabel}
        </span>
        <span className="wx-composer-edit">编辑搜索</span>
        <span className="wx-composer-collapse">收起</span>
      </summary>

      <div className="wx-rail-card">
        <div className="wx-composer-bar">
          <Selector
            label="App Store 区域"
            isLabelHidden
            options={COUNTRY_OPTIONS}
            value={country}
            onChange={(value) => onCountryChange(value as StoreCountry)}
            width="100%"
          />

          <div className="wx-query-inputs">
            <div className="wx-query-rows">
              {rows.map((row, index) => {
                const invalid = validation?.invalidIds.has(row.id) ?? false;
                return (
                  <div
                    key={row.id}
                    className={`wx-query-row${rows.length > 1 ? " has-remove" : ""}`}
                    role="group"
                    aria-label={`应用 ${index + 1}`}
                  >
                    <TextInput
                      label={`应用名称 ${index + 1}`}
                      isLabelHidden
                      width="100%"
                      containerClassName="wx-query-field wx-query-name-field"
                      value={row.name}
                      placeholder="应用名称（与 Bundle ID 二选一）"
                      autoComplete="off"
                      hasSpellCheck={false}
                      ref={(element) => {
                        nameRefs.current[index] = element;
                      }}
                      status={invalid ? { type: "error" } : undefined}
                      aria-describedby={invalid ? "search-query-error" : undefined}
                      onChange={(value) => onRowChange(row.id, "name", value)}
                      onEnter={handleSearchClick}
                    />
                    <TextInput
                      label={`Bundle ID ${index + 1}（与名称二选一）`}
                      isLabelHidden
                      width="100%"
                      containerClassName="wx-query-field wx-query-bundle-field"
                      value={row.bundleId}
                      placeholder="Bundle ID（与名称二选一）"
                      autoComplete="off"
                      autoCapitalize="none"
                      hasSpellCheck={false}
                      status={invalid ? { type: "error" } : undefined}
                      aria-describedby={invalid ? "search-query-error" : undefined}
                      onChange={(value) => onRowChange(row.id, "bundleId", value)}
                      onEnter={handleSearchClick}
                    />
                    {rows.length > 1 ? (
                      <Button
                        type="button"
                        className="wx-query-remove"
                        label={`移除应用 ${index + 1}`}
                        isIconOnly
                        size="lg"
                        icon={<RemoveIcon />}
                        variant="secondary"
                        onClick={() => onRemoveRow(row.id)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              className="wx-query-add"
              label="添加应用"
              variant="ghost"
              size="sm"
              onClick={onAddRow}
            />

            {validation ? (
              <p id="search-query-error" className="wx-query-error" role="alert">
                {validation.message}
              </p>
            ) : null}
          </div>

          <div className="wx-actions">
            <Button
              type="button"
              label="开始搜索"
              variant="primary"
              icon={<SearchIcon />}
              onClick={handleSearchClick}
            />
            <Button
              type="button"
              label="清空结果"
              variant="secondary"
              icon={<ClearIcon />}
              onClick={onClear}
            />
          </div>
        </div>
      </div>
    </details>
  );
}
