import { ReactNode, useEffect, useState } from "react";

export function Delayed({
  delay = 300,
  children,
}: {
  delay?: number;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  if (!show) return null;
  return <>{children}</>;
}
