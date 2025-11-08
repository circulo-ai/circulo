import { ComponentProps } from "react";

export function Logo(props: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="32"
      viewBox="0 0 185 130"
      {...props}
    >
      <circle cx="121.45" cy="65.01" r="63.74" fill="var(--color-teal-900)" />
      <path
        fill="var(--color-teal-50)"
        d="M127.48 46.51A63.78 63.78 0 0 0 93.85 6.85 67.6 67.6 0 0 0 69.1.12a64.8 64.8 0 0 0-25.27 3.6A64.1 64.1 0 0 0 .22 63.34C-.2 84.77.13 106.2 0 127.64c0 1.91.48 2.4 2.4 2.39 20-.08 40-.14 60 0A69.6 69.6 0 0 0 96 122.2c.33-.33 1-.34 1.07-.91a4.6 4.6 0 0 0 1.79-.75 55.4 55.4 0 0 0 11.48-8.76A64.9 64.9 0 0 0 129 77.24a64.2 64.2 0 0 0-1.52-30.73"
      />
      <circle
        cx="121.45"
        cy="65.01"
        r="63.74"
        fill="var(--color-teal-900)"
        opacity=".25"
      />
    </svg>
  );
}
