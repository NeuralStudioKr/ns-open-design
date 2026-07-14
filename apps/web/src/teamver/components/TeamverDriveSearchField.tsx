import { Icon } from "../../components/Icon";

type Props = {
  value: string;
  ariaLabel: string;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  minSearchLength?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
};

export function TeamverDriveSearchField({
  value,
  ariaLabel,
  placeholder,
  disabled = false,
  autoFocus = false,
  minSearchLength = 0,
  onChange,
  onSubmit,
  onClear,
}: Props) {
  const canSubmit = value.trim().length >= minSearchLength;
  const showClear = Boolean(onClear && value.trim());

  return (
    <div className="teamver-drive-picker-search">
      <Icon name="search" size={14} />
      <input
        autoFocus={autoFocus}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (canSubmit) onSubmit();
          }
        }}
      />
      {showClear ? (
        <button
          type="button"
          className="teamver-drive-picker-search-clear"
          aria-label="검색 지우기"
          disabled={disabled}
          data-testid="teamver-drive-search-clear"
          onClick={onClear}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
      <button
        type="button"
        className="teamver-drive-picker-search-submit"
        aria-label="검색"
        disabled={disabled || !canSubmit}
        onClick={() => {
          if (canSubmit) onSubmit();
        }}
      >
        <Icon name="search" size={14} />
      </button>
    </div>
  );
}
