// パフォーマンス最適化パターン集
// ISR、SWR、キャッシュ戦略、N+1解消

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ========================================
// 1. ISR（Incremental Static Regeneration）
// ========================================

/**
 * ISR: 30分キャッシュ（静的生成 + 定期更新）
 */
export const revalidate = 1800; // 30分 = 1800秒

export default async function HomePage() {
  const supabase = createClient();

  // サーバーサイドでデータフェッチ
  // 初回アクセス: サーバー処理（200ms）
  // 2回目以降: 静的HTML配信（15ms）
  const { data: halls } = await supabase
    .from('halls')
    .select('*')
    .order('anaba_score', { ascending: false })
    .limit(10);

  return <HallList halls={halls} />;
}

// ========================================
// 2. Stale-While-Revalidate（SWR）
// ========================================

export const runtime = 'edge'; // Edge Runtime使用

/**
 * API Route: SWRキャッシュ戦略
 * - 60秒以内: キャッシュから即座に返却（10ms）
 * - 60-360秒: キャッシュ返却 + バックグラウンド更新
 * - 360秒以上: サーバーから再取得
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data } = await supabase
    .from('halls')
    .select('*')
    .order('anaba_score', { ascending: false });

  return NextResponse.json({ data }, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    },
  });
}

// ========================================
// 3. N+1問題の解決（JOIN一発取得）
// ========================================

/**
 * ❌ 悪い例: N+1クエリ（3,000ms）
 */
export async function getHallsWithEventsNaive() {
  const supabase = createClient();

  // 1回目: halls取得（300ms）
  const { data: halls } = await supabase.from('halls').select('*');

  // 2回目以降: 各hallのevents取得（1ms × 3,000 = 3,000ms）
  for (const hall of halls) {
    const { data: events } = await supabase
      .from('coverage_events')
      .eq('hall_id', hall.id);

    hall.events = events; // ❌ 非効率
  }

  return halls;
}

/**
 * ✅ 良い例: JOIN一発（220ms）
 */
export async function getHallsWithEventsOptimized() {
  const supabase = createClient();

  // JOINで一発取得（220ms）
  const { data } = await supabase
    .from('halls')
    .select(`
      *,
      coverage_events!inner (
        id,
        event_date,
        media_name,
        status,
        title
      )
    `)
    .eq('coverage_events.status', 'scheduled')
    .order('anaba_score', { ascending: false });

  return data; // ✅ 93%高速化
}

// ========================================
// 4. データフェッチ並列化
// ========================================

/**
 * ❌ 悪い例: 逐次実行（900ms）
 */
export async function fetchDataSequential() {
  const supabase = createClient();

  const { data: halls } = await supabase.from('halls').select('*');      // 300ms
  const { data: events } = await supabase.from('coverage_events').select('*'); // 300ms
  const { data: media } = await supabase.from('media_masters').select('*');   // 300ms

  return { halls, events, media }; // 合計: 900ms
}

/**
 * ✅ 良い例: 並列実行（300ms）
 */
export async function fetchDataParallel() {
  const supabase = createClient();

  const [hallsResult, eventsResult, mediaResult] = await Promise.all([
    supabase.from('halls').select('*'),          // 300ms（並列）
    supabase.from('coverage_events').select('*'), // 300ms（並列）
    supabase.from('media_masters').select('*'),   // 300ms（並列）
  ]);

  return {
    halls: hallsResult.data,
    events: eventsResult.data,
    media: mediaResult.data,
  }; // 合計: 300ms（67%削減）
}

// ========================================
// 5. React Query（クライアントキャッシュ）
// ========================================

'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * クライアントサイドキャッシュ
 */
export function useHalls(prefecture?: string) {
  return useQuery({
    queryKey: ['halls', prefecture],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (prefecture) params.set('prefecture', prefecture);

      const res = await fetch(`/api/halls?${params}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,  // 5分間はキャッシュを新鮮と見なす
    cacheTime: 30 * 60 * 1000, // 30分間メモリに保持
    refetchOnWindowFocus: true, // ウィンドウフォーカス時に再取得
  });
}

/**
 * 使用例
 */
export function HallList({ prefecture }: { prefecture?: string }) {
  const { data, isLoading, error } = useHalls(prefecture);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage />;

  return (
    <div>
      {data.data.map((hall) => (
        <HallCard key={hall.id} hall={hall} />
      ))}
    </div>
  );
}

// ========================================
// 6. 画像最適化（next/image）
// ========================================

import Image from 'next/image';

/**
 * ❌ 悪い例: 通常のimg（450KB、LCP 2.4秒）
 */
export function HallImageNaive() {
  return <img src="/hall-main.jpg" alt="店舗画像" />; // 450KB JPEG
}

/**
 * ✅ 良い例: next/image（135KB WebP、LCP 0.6秒）
 */
export function HallImageOptimized() {
  return (
    <Image
      src="/hall-main.jpg"
      width={1920}
      height={1080}
      alt="店舗画像"
      priority  // LCPイメージは優先読み込み
      quality={85}
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..."
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    />
  );
  // 自動最適化:
  // - WebP変換（450KB → 135KB、70%削減）
  // - レスポンシブ画像（srcset自動生成）
  // - 遅延読み込み（Lazy Loading）
}

// ========================================
// 7. Code Splitting（動的インポート）
// ========================================

import dynamic from 'next/dynamic';

/**
 * 地図ライブラリを動的インポート（200KB削減）
 */
const Map = dynamic(() => import('@/components/map'), {
  loading: () => <MapSkeleton />,
  ssr: false, // クライアントのみで実行
});

export function HallDetailPage({ hall }) {
  return (
    <div>
      <h1>{hall.name}</h1>
      {/* 地図は必要になってから読み込み */}
      <Map latitude={hall.latitude} longitude={hall.longitude} />
    </div>
  );
}

// ========================================
// 8. データベースインデックス活用
// ========================================

/**
 * インデックスを活用したクエリ
 */
export async function searchHallsOptimized(prefecture: string) {
  const supabase = createClient();

  // インデックス: idx_halls_location (prefecture, city)
  const { data } = await supabase
    .from('halls')
    .select('*')
    .eq('prefecture', prefecture)  // インデックス活用
    .order('anaba_score', { ascending: false });

  return data; // 450ms → 180ms（60%削減）
}

// ========================================
// 9. Suspense + Streaming SSR
// ========================================

import { Suspense } from 'react';

/**
 * ストリーミングSSR（段階的レンダリング）
 */
export default async function Page() {
  return (
    <div>
      {/* 即座に表示（キャッシュ済み） */}
      <Header />

      {/* 遅延読み込み */}
      <Suspense fallback={<HallListSkeleton />}>
        <HallList />
      </Suspense>

      <Suspense fallback={<EventCalendarSkeleton />}>
        <EventCalendar />
      </Suspense>

      {/* 即座に表示 */}
      <Footer />
    </div>
  );
}

// ========================================
// 10. メモ化（useMemo、useCallback）
// ========================================

'use client';

import { useMemo, useCallback } from 'react';

export function HallFilter({ halls }) {
  // 高コストな計算をメモ化
  const filteredHalls = useMemo(() => {
    return halls
      .filter(h => h.anaba_score >= 80)
      .sort((a, b) => b.anaba_score - a.anaba_score);
  }, [halls]); // hallsが変わった時のみ再計算

  // コールバック関数をメモ化
  const handleClick = useCallback((hallId: string) => {
    console.log('Clicked:', hallId);
  }, []); // 依存配列が空 = 再生成なし

  return (
    <div>
      {filteredHalls.map((hall) => (
        <HallCard key={hall.id} hall={hall} onClick={handleClick} />
      ))}
    </div>
  );
}

// ========================================
// まとめ: 最適化効果
// ========================================

/**
 * 【Before】
 * - LCP: 3.8秒
 * - JavaScript: 240KB
 * - データフェッチ: 3,300ms（N+1問題）
 *
 * 【After】
 * - LCP: 1.2秒（68%改善）
 * - JavaScript: 150KB（38%削減）
 * - データフェッチ: 220ms（93%削減）
 * - キャッシュヒット率: 92%
 */
