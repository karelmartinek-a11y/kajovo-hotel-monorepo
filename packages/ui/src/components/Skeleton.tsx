import React from 'react';

type SkeletonBlockProps = {
  width?: string;
  height?: string;
};

export function SkeletonBlock({ width = '100%', height = '20px' }: SkeletonBlockProps): JSX.Element {
  return <span className="k-skeleton-block" style={{ width, height }} aria-hidden="true" />;
}

type SkeletonPageProps = {
  rows?: number;
};

export function SkeletonPage({ rows = 4 }: SkeletonPageProps): JSX.Element {
  return (
    <section className="k-skeleton-page" data-testid="state-view-loading">
      <SkeletonBlock width="40%" height="34px" />
      <div className="k-skeleton-grid">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock key={`skeleton-${index}`} width="100%" height="88px" />
        ))}
      </div>
    </section>
  );
}
