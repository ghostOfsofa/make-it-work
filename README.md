# 우하향 추세 종목 필터링 + MA5 돌파 감시

SQLite를 단일 데이터 원본으로 사용하는 JavaScript 기반 한국 주식 스크리너입니다. 일봉 OHLCV를 DB에 저장한 뒤, 최근일을 종료점으로 고정하고 최근 10~60봉 구간을 확장 스캔해 강한 우하향 종목을 찾습니다. 필터링된 종목만 장중 현재가 감시 대상으로 삼고, 현재가가 완료된 일봉 기준 MA5를 상향 돌파하면 `buy_signals`에 매수 신호만 저장합니다.

## 데이터 흐름

1. `scripts/fetch-krx-data.py` 또는 샘플 생성으로 `data/stocks.db`에 일봉 저장
2. `npm run screen`으로 DB 일봉 기준 우하향 종목 필터링
3. 필터링 결과를 `screening_runs`, `filtered_stocks`에 저장
4. `npm run watch:buy`로 `filtered_stocks` 종목만 현재가 조회
5. 현재가는 저장하지 않고 MA5 상향 돌파 시 `buy_signals`만 저장
6. `npm run generate`로 DB 내용을 읽어 `dist/chart.html` 생성

## 설치

```bash
npm install
pip install finance-datareader
```

## 실제 데이터 수집

```bash
python3 scripts/fetch-krx-data.py --days 180 --max-stocks 100
```

로컬 Python 환경까지 한 번에 준비하려면:

```bash
bash scripts/setup-local-fetch.sh
```

테스트로 일부 종목만 수집:

```bash
MAX_STOCKS=100 bash scripts/setup-local-fetch.sh
```

전체 종목 수집:

```bash
python3 scripts/fetch-krx-data.py --days 180
```

옵션:

- `--days`: 수집할 최근 거래일 범위
- `--incremental-days`: 이미 DB에 가격 데이터가 있는 종목의 재수집 범위, 기본값 `10`
- `--max-stocks`: 테스트용 종목 수 제한
- `--db-path`: SQLite DB 경로, 기본값 `data/stocks.db`
- `--sleep`: 종목별 요청 간격

수집 방식:

- 종목별 `stock_prices` row가 없으면 초기 수집으로 `--days` 기준 넓은 기간을 가져옵니다.
- 이미 가격 데이터가 있으면 최신 저장일을 확인하고, 기준 종료일 전 최근 `--incremental-days` 범위만 다시 가져와 UPSERT합니다.
- 최신 저장일이 기준 종료일 이상이면 해당 종목은 건너뜁니다.

## 샘플 DB 실행

실제 데이터 없이도 전체 흐름을 확인할 수 있습니다.

```bash
npm run create:sample-db
npm run screen
node src/watchBuySignals.js --once
npm run generate
open dist/chart.html
```

`npm run create:sample-db`는 기존 `stock_prices` row가 있으면 기본적으로 건너뜁니다. 기존 DB를 지우고 샘플을 다시 만들 때만 아래처럼 실행하세요.

```bash
npm run create:sample-db -- --reset
```

## 실제 데이터 실행

```bash
npm run fetch:krx
npm run screen
npm run watch:buy
npm run generate
open dist/chart.html
```

## 로컬 수집 후 서버 업로드

로컬에서 KRX 데이터를 수집한 뒤 서버에서 같은 DB를 사용하려면 업로드용 DB 사본을 만든 후 서버의 `data/stocks.db` 위치에 복사합니다.

```bash
python3 scripts/fetch-krx-data.py --days 180 --incremental-days 10
npm run screen
npm run prepare:db-upload
scp dist/stocks.db user@server:/path/to/app/data/stocks.db
```

서버에서는 업로드된 DB를 기준으로 HTML만 다시 만들면 됩니다.

```bash
npm install
npm run generate
```

Node 프로그램은 기본적으로 `data/stocks.db`를 읽습니다. `data/stocks.db`가 없고 `dist/stocks.db`가 있으면 업로드용 DB를 자동으로 읽습니다. 다른 경로를 쓰려면 `DB_PATH`를 지정하세요.

```bash
DB_PATH=/path/to/stocks.db npm run generate
DB_PATH=/path/to/stocks.db npm run screen
```

`stocks.db`를 실행 중인 상태에서 직접 복사하면 WAL 파일 때문에 일부 최신 row가 빠질 수 있습니다. `npm run prepare:db-upload`는 WAL checkpoint와 SQLite backup을 거쳐 `dist/stocks.db`를 생성하므로 이 파일을 올리는 방식이 안전합니다.

`npm run watch:buy`는 반복 감시 프로세스입니다. 테스트로 한 번만 실행하려면:

```bash
node src/watchBuySignals.js --once
```

## DB 구조

- `stocks`: 종목 기본 정보
- `stock_prices`: 일봉 OHLCV
- `screening_runs`: 우하향 필터링 실행 이력
- `filtered_stocks`: 필터링된 감시 대상 종목
- `buy_signals`: MA5 상향 돌파 매수 신호

실시간 현재가는 DB에 저장하지 않습니다. 현재가는 quote provider에서 조회해 메모리에서만 판단하고, 조건 충족 이벤트인 `buy_signals`만 저장합니다.

## DB 확인

```bash
npm run check:db
python3 scripts/check-db.py --code 005930
```

## 종목별 일봉 조회

로컬 `data/stocks.db`에서 종목별/일자별 OHLCV를 조회할 수 있습니다.

```bash
npm run prices -- --code 005930 --limit 20
npm run prices -- --code 005930 --from-date 2026-05-01 --to-date 2026-05-13
npm run prices -- --name 삼성 --latest --limit 10
python3 scripts/query-prices.py --code 005930 --csv --output samsung.csv
```

## 주요 npm scripts

- `npm run fetch:krx`: FinanceDataReader로 KRX OHLCV를 SQLite에 저장
- `npm run create:sample-db`: 테스트용 SQLite DB 생성
- `npm run screen`: 우하향 종목 필터링 후 DB 저장
- `npm run watch:buy`: filtered stocks 대상 MA5 돌파 감시
- `npm run generate`: DB에서 읽어 `dist/chart.html` 생성
- `npm run build`: Pages 배포용 HTML 생성
- `npm run check:db`: DB 상태 확인
- `npm run prices`: 종목별 일봉 OHLCV 조회
- `npm run prepare:db-upload`: 서버 업로드용 SQLite DB 사본 생성

## 필터 조건

기본 옵션:

```js
{
  renderPeriod: 80,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  minAngleDegree: 29,
  minReturnRate: -5,
  minRSquared: 0.5
}
```

조건:

- `slopePixel > 0`
- `angleDegree >= minAngleDegree`
- `rSquared >= minRSquared`
- `returnRate <= minReturnRate`

검색 종료일은 항상 가장 최근 거래일입니다. 최근 10봉, 11봉, 12봉처럼 시작점만 과거로 확장하며 검사합니다.

## selectedPrice 규칙

추세 계산에는 캔들 방향에 따라 선택 가격을 사용합니다.

```js
selectedPrice = close >= open ? close : open
```

봉차트 렌더링은 실제 `open/high/low/close`를 사용하고, 회귀 추세선 계산만 `selectedPrice`를 사용합니다.

## 각도 계산

가격 변화율이 아니라 실제 16:9 차트 plot 영역에 표시되는 좌표 기울기를 기준으로 계산합니다.

```js
xPixel = margin.left + (index / (period - 1)) * plotWidth
yPixel = margin.top + (maxPrice - price) / (maxPrice - minPrice) * plotHeight
angleDegree = Math.atan(slopePixel) * 180 / Math.PI
```

화면 좌표에서는 아래로 갈수록 y가 커지므로 `slopePixel > 0`이면 우하향입니다.

## MA5 돌파 감시

MA5는 DB에 저장된 완료된 최근 5거래일 `close` 평균입니다. 실시간 현재가는 MA5 계산에 포함하지 않습니다.

상향 돌파 조건:

```js
previousPrice <= ma5Price && currentPrice > ma5Price
```

첫 조회 시 `previousPrice`가 없으면 최근 완료 일봉의 `previousClose`를 사용합니다. 같은 종목, 같은 기준일, 같은 `CROSS_ABOVE_MA5` 신호는 하루 1회만 저장됩니다.

## Quote Provider

현재 구현은 `src/quoteProviders/mockQuoteProvider.js`를 사용합니다. 실제 키움 OpenAPI, KIS API 등은 `fetchQuotes(codes, context)` 인터페이스를 맞춰 교체하면 됩니다.

## GitHub Pages 배포

`.github/workflows/deploy.yml`은 `main` push 시 실행됩니다.

1. Node 20 설치
2. `npm install`
3. `data/stocks.db` 또는 `dist/stocks.db` 존재 여부 확인
4. DB가 있으면 `npm run screen`
5. `npm run generate`
6. `dist`를 GitHub Pages에 배포

배포 과정에서는 샘플 DB를 생성하지 않습니다. DB가 없으면 안내용 빈 HTML만 생성됩니다.
스케줄/수동 실행의 실제 DB는 GitHub Actions cache로 `data/stocks.db`를 복원한 뒤 갱신합니다. 캐시가 없으면 최초 수집으로 `--days 180` 범위를 받고, 캐시가 있으면 종목별 기존 row를 확인해 `--incremental-days 10` 범위만 UPSERT합니다.

GitHub Pages 설정에서 Source를 **GitHub Actions**로 지정하세요.

## 주의사항

- JSON 저장 방식은 사용하지 않습니다.
- DB가 단일 데이터 원본입니다.
- `chart.html`은 브라우저에서 SQLite를 직접 읽지 않고, `generate` 시점의 DB 데이터를 HTML 안에 포함합니다.
- 매수 주문 실행은 구현하지 않았습니다.
- 실거래 적용 전 실제 quote provider, 장 운영 시간, 중복 신호 정책, 리스크 조건을 별도로 검증해야 합니다.
