'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getActor, getDefaultRouteForActor, ROLE_LABELS, type Actor } from '@/thu-vien/auth';

type AccessDeniedProps = {
  area: string;
  permission: string;
};

export function AccessDenied({ area, permission }: AccessDeniedProps) {
  const [actor, setActor] = useState<Actor | null>(null);

  useEffect(() => {
    void getActor()
      .then(setActor)
      .catch(() => setActor(null));
  }, []);

  const homeHref = actor ? getDefaultRouteForActor(actor) : '/';

  return (
    <main className="access-shell-modern">
      <div className="access-card">
        <div className="access-icon-wrapper">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="access-badge">Chick Res / {area}</p>
        <h1 className="access-title">Không có quyền truy cập</h1>
        <p className="access-explanation">
          Tài khoản hiện tại chưa được cấp quyền{' '}
          <code className="permission-tag">{permission}</code> để thao tác tại màn hình{' '}
          <strong>{area}</strong>.
        </p>

        {actor && (
          <div className="access-actor-card">
            <div className="actor-row">
              <span className="actor-lbl">Tài khoản:</span>
              <span className="actor-val">{actor.email}</span>
            </div>
            <div className="actor-row">
              <span className="actor-lbl">Vai trò:</span>
              <span className="role-pill">{ROLE_LABELS[actor.role] ?? actor.role}</span>
            </div>
          </div>
        )}

        <div className="access-actions">
          <Link className="btn-primary" href={homeHref}>
            Về bàn làm việc của bạn
          </Link>
          <Link className="btn-secondary" href="/login">
            Đăng nhập tài khoản khác
          </Link>
        </div>
      </div>
    </main>
  );
}
