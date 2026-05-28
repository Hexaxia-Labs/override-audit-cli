import type {ReactNode} from 'react';

export default function Root({children}: {children: ReactNode}): ReactNode {
  return (
    <>
      <div className="bg-glow bg-glow-a" />
      <div className="bg-glow bg-glow-b" />
      {children}
    </>
  );
}
