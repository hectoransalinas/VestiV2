import React from "react";
import { vestiTheme } from "../theme";

type ChipProps = {
  children: React.ReactNode;
  borderColor?: string;
  backgroundColor?: string;
};

export const Chip: React.FC<ChipProps> = ({
  children,
  borderColor,
  backgroundColor,
}) => {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 8px",
        borderRadius: 999,
        border: `1px solid ${borderColor ?? vestiTheme.colors.border}`,
        backgroundColor: backgroundColor ?? vestiTheme.colors.bgSoft,
        fontSize: 11,
        color: vestiTheme.colors.text,
        lineHeight: 1.3,
        gap: 4,
      }}
    >
      {children}
    </span>
  );
};
