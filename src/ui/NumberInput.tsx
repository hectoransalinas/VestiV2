import React from "react";
import { vestiTheme } from "../theme";

type NumberInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

/**
 * NumberInput
 * -----------
 * Input numérico simple con estilos consistentes con el theme.
 */
export const NumberInput: React.FC<NumberInputProps> = ({ label, ...rest }) => {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 11,
        color: vestiTheme.colors.subtext,
      }}
    >
      {label && <span>{label}</span>}
      <input
        type="number"
        {...rest}
        style={{
          borderRadius: 8,
          border: `1px solid ${vestiTheme.colors.border}`,
          padding: "6px 8px",
          fontSize: 12,
          outline: "none",
          ...rest.style,
        }}
      />
    </label>
  );
};
