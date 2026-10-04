/**
 * Host bazlı devre kesici (circuit breaker).
 *
 * Neden: GitHub Actions runner IP'leri bazı kaynaklar tarafından engelleniyor.
 * Engellenen bir kaynağa üst üste istek atmak durumu kötüleştiriyor ve
 * kullanıcıya 30 saniyelik zaman aşımı beklemekten başka bir şey kazandırmıyor.
 *
 * Mantık: bir host üst üste `failureThreshold` hata verirse devre açılır ve
 * `cooldownMs` boyunca tüm istekler anında, açıklayıcı bir hata ile reddedilir.
 * Süre dolduğunda "yarı açık" duruma geçilir: bir istek denenir, başarılıysa
 * devre kapanır, başarısızsa sayaç sıfırlanıp yeniden açılır.
 */

export interface BreakerState {
  failures: number;
  openedAt: number | null;
  probing: boolean;
}

const breakers = new Map<string, BreakerState>();

export interface BreakerConfig {
  /** Devre açılmadan önce gereken üst üste hata sayısı. */
  failureThreshold: number;
  /** Devre açık kalacağı süre (ms). */
  cooldownMs: number;
}

export const DEFAULT_BREAKER: BreakerConfig = {
  failureThreshold: 4,
  cooldownMs: 45_000,
};

/** Devrenin açık olup olmadığını ve nedenini döndürür. */
export function breakerStatus(
  host: string,
  now = Date.now(),
  config: BreakerConfig = DEFAULT_BREAKER
): { open: boolean; failures: number; retryInMs: number } {
  const state = breakers.get(host);
  if (!state || state.openedAt === null) {
    return { open: false, failures: state?.failures ?? 0, retryInMs: 0 };
  }
  const elapsed = now - state.openedAt;
  if (elapsed >= config.cooldownMs) {
    return { open: false, failures: state.failures, retryInMs: 0 };
  }
  return { open: true, failures: state.failures, retryInMs: config.cooldownMs - elapsed };
}

export function isBreakerOpen(host: string, now = Date.now(), config?: BreakerConfig): boolean {
  return breakerStatus(host, now, config).open;
}

/** Başarılı istek: sayacı sıfırlar ve devreyi kapatır. */
export function recordSuccess(host: string): void {
  breakers.delete(host);
}

/** Başarısız istek: eşik aşılırsa devreyi açar. */
export function recordFailure(
  host: string,
  now = Date.now(),
  config: BreakerConfig = DEFAULT_BREAKER
): void {
  const state = breakers.get(host) ?? { failures: 0, openedAt: null, probing: false };

  // Yarı açık durumda bir deneme yapılıyordu: başarısız olursa yeniden aç.
  if (state.probing) {
    breakers.set(host, { failures: config.failureThreshold, openedAt: now, probing: false });
    return;
  }

  state.failures += 1;
  if (state.failures >= config.failureThreshold && state.openedAt === null) {
    state.openedAt = now;
  }
  breakers.set(host, state);
}

/** Soğuma süresi dolmuş devreyi "yarı açık" duruma taşır (deneme hakkı). */
export function markProbing(
  host: string,
  now = Date.now(),
  config: BreakerConfig = DEFAULT_BREAKER
): void {
  const status = breakerStatus(host, now, config);
  if (status.open || status.failures === 0) return;
  breakers.set(host, { failures: status.failures, openedAt: now, probing: true });
}

/** Tüm devreleri temizler (testler ve get_data_health için). */
export function breakerReset(): void {
  breakers.clear();
}

/** Teşhis çıktısı. */
export function breakerSnapshot(): Array<{ host: string; status: BreakerState }> {
  return [...breakers.entries()].map(([host, status]) => ({ host, status }));
}

export class BreakerOpenError extends Error {
  readonly host: string;
  readonly retryInMs: number;

  constructor(host: string, retryInMs: number) {
    super(
      `${host} kaynağı geçici olarak erişilemiyor (önceki istekler başarısız oldu). ` +
        `${Math.ceil(retryInMs / 1000)} saniye sonra tekrar deneyin.`
    );
    this.name = "BreakerOpenError";
    this.host = host;
    this.retryInMs = retryInMs;
  }
}

/** İstek öncesi kontrol: devre açıksa anında hata fırlatır. */
export function assertBreakerClosed(
  host: string,
  now = Date.now(),
  config: BreakerConfig = DEFAULT_BREAKER
): void {
  const status = breakerStatus(host, now, config);
  if (status.open) {
    markProbing(host, now, config);
    throw new BreakerOpenError(host, status.retryInMs);
  }
}
