import type { SVGProps } from "react";

export function Logo({
  fill = "#F7661E",
  strokeWidth = 34,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="190.8 159.5 690.8 261"
      role="img"
      aria-label="oder"
      fill="none"
      stroke={fill}
      strokeWidth={strokeWidth}
      {...props}
    >
      <path d="M213.95 420.5V318.35A74.05 74.05 0 0 1 362.05 318.35V347.45A50 50 0 0 0 462.05 347.45V287.45A74.05 74.05 0 0 1 610.15 287.45V316.65A50 50 0 0 0 710.15 316.65V256.65A74.05 74.05 0 0 1 858.25 256.65V352.8" />
    </svg>
  );
}
