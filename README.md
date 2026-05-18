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
python3 scripts/fetch-krx-data.py --days 700 --max-stocks 100
```

로컬 Python 환경까지 한 번에 준비하려면:

```bash
bash scripts/setup-local-fetch.sh
```

테스트로 일부 종목만 수집:

```bash
MAX_STOCKS=100 bash scripts/setup-local-fetch.sh
```

이 스크립트는 기본적으로 데이터 수집 후 `npm run screen`, `npm run generate`까지 실행합니다. 수집만 하고 싶으면:

```bash
RUN_SCREEN=0 RUN_GENERATE=0 bash scripts/setup-local-fetch.sh
```

스크리닝까지만 하고 HTML 생성을 건너뛰고 싶으면:

```bash
RUN_GENERATE=0 bash scripts/setup-local-fetch.sh
```

이미 `.venv`에 FinanceDataReader가 설치되어 있고 pip 설치 과정을 건너뛰고 싶으면:

```bash
SKIP_PIP_INSTALL=1 bash scripts/setup-local-fetch.sh
```

KRX 네트워크가 일시적으로 실패해도 기존 `data/stocks.db`가 있으면 기본적으로 그 DB로 스크리닝을 계속합니다. 실패 시 즉시 중단하고 싶으면:

```bash
ALLOW_FETCH_FAILURE_WITH_EXISTING_DB=0 bash scripts/setup-local-fetch.sh
```

로컬 기본 Node가 v25처럼 `better-sqlite3`가 지원하지 않는 버전이면 스크립트가 자동으로 `npx node@20`으로 스크리닝을 실행합니다. fallback 버전을 바꾸려면:

```bash
NODE_FALLBACK_VERSION=22 bash scripts/setup-local-fetch.sh
```

전체 종목 수집:

```bash
python3 scripts/fetch-krx-data.py --days 700
```

옵션:

- `--days`: 수집할 최근 캘린더 일수. EMA448 계산을 위해 `700` 이상 권장
- `--skip-existing`: 충분한 기존 주가 데이터가 있으면 수집을 건너뜀, 기본 ON
- `--force`: 기존 데이터 여부와 관계없이 전체 대상 재수집
- `--min-price-rows`: skip 가능한 최소 일봉 row 수, 기본값 `448`
- `--stale-days`: 마지막 저장 일봉이 오늘 기준 며칠 이상 오래되면 재수집할지, 기본값 `5`
- `--max-stocks`: 테스트용 종목 수 제한
- `--db-path`: SQLite DB 경로, 기본값 `data/stocks.db`
- `--sleep`: 종목별 요청 간격

수집 방식:

- 기본적으로 DB에 기존 주가 데이터가 충분하면 다시 가져오지 않습니다.
- 종목별 `stock_prices` row가 없거나, `--min-price-rows`보다 적거나, 마지막 저장 일봉이 `--stale-days`보다 오래되면 `--days` 범위를 다시 가져와 UPSERT합니다.
- 기존 데이터를 무시하고 전체 대상 재수집이 필요하면 `--force`를 사용합니다.

예:

```bash
python3 scripts/fetch-krx-data.py --days 700
python3 scripts/fetch-krx-data.py --days 700 --force
python3 scripts/fetch-krx-data.py --days 700 --min-price-rows 448 --stale-days 5
```

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

로컬에서 KRX 데이터를 수집한 뒤 HTML까지 생성해서 정적 서버에 올릴 수 있습니다. 이 경우 서버에는 DB, Node, Python이 필요 없습니다.

```bash
bash scripts/setup-local-fetch.sh
scp -r dist/index.html dist/chart.html dist/assets user@server:/path/to/static/
```

GitHub Pages에 로컬에서 생성한 HTML을 그대로 배포하려면 루트 HTML도 갱신해서 커밋합니다.

```bash
PUBLISH_HTML_TO_ROOT=1 bash scripts/setup-local-fetch.sh
git add index.html chart.html assets/
git commit -m "Update generated static charts"
git push
```

서버에서 다시 스크리닝하거나 HTML을 다시 생성하려는 경우에만 DB를 올립니다.

`npm run generate`는 최근 20개 screening run 목록과 run별 결과 JSON을 분리해서 생성합니다.

```text
dist/assets/screening-runs.json
dist/assets/runs/run-{runId}.json
```

`chart.html`에서는 최근 20개 필터링 일자를 선택해 과거 run의 필터링 당시 가격과 DB 최신 일봉 종가를 비교할 수 있습니다. 현재 기준 주가는 실시간 가격이 아니라 `stock_prices`의 최신 `close`입니다.

```js
currentReturnRate = ((currentPrice - filteredLastPrice) / filteredLastPrice) * 100
```

```bash
npm run prepare:db-upload
scp dist/stocks.db user@server:/path/to/app/data/stocks.db
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

- `stocks`: 종목 기본 정보와 ETF/ETN/스팩/리츠/우선주/거래정지/환기종목 제외용 메타 정보
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
- `npm run screen:jjap-subak`: 짭쩡 필터링 후 DB 저장
- `npm run watch:buy`: filtered stocks 대상 MA5 돌파 감시
- `npm run generate`: DB에서 읽어 `dist/chart.html` 생성
- `npm run build`: Pages 배포용 HTML 생성
- `npm run check:db`: DB 상태 확인
- `npm run prices`: 종목별 일봉 OHLCV 조회
- `npm run prepare:db-upload`: 서버 업로드용 SQLite DB 사본 생성

## 필터 조건

### screen_type

필터링 실행 이력과 결과는 `screen_type`으로 구분합니다.

- `DOWNTREND`: 기존 우하향 필터 (`npm run screen`)
- `JJAP_SUBAK`: 짭쩡 (`npm run screen:jjap-subak`)

짭쩡는 기존 우하향 필터와 별도로 동작하는 커스텀 필터이며, 결과는 `screening_runs`와 `filtered_stocks`에 `screen_type = 'JJAP_SUBAK'`으로 저장됩니다.

짭쩡의 스크리닝 대상도 `KOSPI`, `KOSDAQ` market 조건과 ETF/ETN, SPAC, REIT, 우선주, 거래정지, 환기/관리종목, 최신 일봉일 조건을 적용합니다.

짭쩡는 마지막 종가가 2,000원 초과인 종목만 통과시킵니다.

짭쩡 조건에는 일목균형표 구름 위 조건도 포함합니다. 전환선은 9봉, 기준선은 26봉, 선행스팬B는 52봉 기준입니다. 필터 판단은 Senkou Span A/B를 26봉 이동해서 현재 봉 위치에 표시되는 구름을 기준으로 `lastClose > shiftedCloudTop`을 사용합니다. 단, 구름 상단보다 13% 이상 높으면 제외하므로 `((lastClose - shiftedCloudTop) / shiftedCloudTop) * 100 < 13`이어야 합니다. `shiftedCloudTop = max(shiftedSenkouSpanA, shiftedSenkouSpanB)`이며, 최소 `52 + 26 = 78`봉 이상의 데이터가 필요합니다. 차트 표시도 같은 26봉 이동 구름을 그립니다. 기존 우하향 필터(`DOWNTREND`) 차트는 변경하지 않습니다.

짭쩡 차트의 일목균형표는 Senkou Span A/B와 그 사이 구름 영역만 표시합니다. 전환선과 기준선은 Senkou Span A 계산에는 사용되지만 차트에는 표시하지 않습니다.

짭쩡는 close 기준 EMA112/224/448 장기 조건도 확인합니다. EMA112는 반드시 있어야 하며, 아래 중 하나라도 만족하면 통과합니다.

- EMA112, EMA224, EMA448 세 개가 3% 이내로 모여 있음
- 또는 EMA112-EMA224, EMA112-EMA448, EMA224-EMA448 중 하나라도 3% 이내로 모여 있음
- `EMA112 < EMA224 < EMA448` 역배열
- EMA224 또는 EMA448을 계산할 수 없음

추가로 EMA112 > EMA224 > EMA448 정배열 상태에서 EMA112-EMA224 또는 EMA224-EMA448 이격률이 5% 이상이면 제외합니다. 이격률은 `((EMA112 - EMA224) / EMA224) * 100`, `((EMA224 - EMA448) / EMA448) * 100`으로 계산하며, 기본 `maxBullishLongEmaPairGapRate`는 `5`입니다.

또한 EMA112 > EMA224 > EMA448 정배열 상태에서 26봉 이동 기준 일목균형표 구름대 상단이 EMA112보다 위에 있으면 제외합니다. 조건은 `shiftedCloudTop > EMA112`입니다.

추가로 EMA112/224/448 중 존재하는 가장 높은 장기 EMA보다 마지막 종가가 30% 이상 위에 있으면 제외합니다. 이격률은 `((lastClose - highestLongEma) / highestLongEma) * 100`으로 계산하며, EMA 값이 없는 경우에는 존재하는 EMA만 사용합니다.

짭쩡 차트에는 close 기준 33일 볼린저밴드 상한선만 표시합니다. 표준편차 배수는 `0.1`, 밴드는 25봉 미래 방향으로 shift해서 사용하며, 상한선은 최근 차트 구간에서 값이 있는 지점을 최대한 길게 노란색 두꺼운 선으로 표시합니다. 중간선과 하한선은 표시하지 않습니다. 종가가 shifted upper band를 아래에서 위로 돌파하면 노란색 화살표로 표시합니다. 노란색 화살표는 봉 아래에 표시하고, 최근 5거래일 중 볼린저밴드 상단 돌파 화살표가 1개 이상 있는 종목만 통과합니다.

기본 옵션:

```js
{
  renderPeriod: 80,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  rightPaddingBars: 5,
  minAngleDegree: 45,
  minReturnRate: -5,
  minRSquared: 0.5,
  useEmaBearishFilter: true,
  useLastPriceBelowEma5Filter: true,
  useEma5To112GapFilter: true,
  minEma5To112GapRate: 3,
  emaPeriods: [5, 20, 60, 112, 224, 448],
  bearishEmaPeriods: [112, 224, 448]
}
```

조건:

- `slopePixel > 0`
- `angleDegree >= minAngleDegree`
- `rSquared >= minRSquared`
- `returnRate <= minReturnRate`
- 장기 EMA 조건: EMA112/224/448 모임, `EMA112 < EMA224 < EMA448` 역배열, 또는 EMA224/448 없음
- 마지막 종가가 `EMA5` 아래
- `EMA5`가 `EMA112`보다 3% 이상 아래

검색 종료일은 항상 가장 최근 거래일입니다. 최근 10봉, 11봉, 12봉처럼 시작점만 과거로 확장하며 검사합니다.

본 스크리너는 장기 EMA 조건을 통과하고, 마지막 종가가 EMA5 아래에 있으며 EMA5가 EMA112보다 충분히 아래에 있는 종목만 우하향 후보로 저장합니다. 이후 장중 현재가가 EMA5를 상향 돌파하면 `buy_signals`에 매수 후보로 기록합니다.

### 종목 universe 제외 규칙

`npm run screen`은 기본적으로 `KOSPI`, `KOSDAQ` 시장의 일반 개별 보통주 위주로만 우하향 패턴을 검사합니다. `KONEX`, ETF, ETN, market이 비어 있거나 알 수 없는 종목은 스크리닝 대상에서 제외합니다. 허용 시장은 필요하면 실행 시 바꿀 수 있습니다.

```bash
ALLOWED_MARKETS=KOSPI,KOSDAQ npm run screen
```

`stocks` 테이블의 메타 컬럼과 종목명 기반 보정값을 사용해 아래 대상도 제외합니다.

- ETF, ETN
- SPAC
- REITs
- 우선주
- 거래정지 종목
- 관리종목
- 투자주의환기종목
- 기타 `stock_type = 'OTHER'` 종목
- 차트에 표시되는 최근 80봉 안에서 인접 일봉 날짜 사이에 40일 이상 공백이 있는 종목

투자주의/경고/위험 종목은 기본 제외하지 않습니다. 필요하면 실행 시 켤 수 있습니다.

```bash
EXCLUDE_INVESTMENT_WARNING=1 npm run screen
```

최근 80봉 내부 날짜 공백 제외는 거래정지 또는 장기 미거래로 인한 추세 왜곡을 줄이기 위한 조건입니다. 기준은 가격 동일 여부가 아니라 인접 일봉 날짜 차이입니다.

```bash
MAX_TRADING_GAP_DAYS=40 npm run screen
```

각 제외 조건은 환경변수로 끌 수 있습니다.

```bash
EXCLUDE_ETF=0 EXCLUDE_ETN=0 EXCLUDE_PREFERRED=0 npm run screen
```

`scripts/check-db.py`는 market별 종목 수, ETF/ETN/우선주/스팩/리츠/환기종목 등 제외 현황과 실제 screening target 수를 함께 출력합니다.

### 장기 EMA 필터

우하향 필터링은 종가 `close` 기준 EMA를 함께 계산합니다. 기간은 `5, 20, 60, 112, 224, 448`이고, 장기 EMA 조건은 아래 중 하나라도 만족하면 통과합니다.

1. EMA112, EMA224, EMA448 세 개가 3% 이내로 모여 있음
2. EMA112-EMA224, EMA112-EMA448, EMA224-EMA448 중 하나라도 3% 이내로 모여 있음
3. `EMA112 < EMA224 < EMA448` 역배열
4. EMA224 또는 EMA448을 계산할 수 없음

단, EMA112가 없으면 제외합니다.

EMA5와 EMA112의 차이율도 함께 확인합니다.

```js
((ema112 - ema5) / ema112) * 100 >= 3
```

추세선 각도 계산은 `high` 기준이고, EMA는 반드시 `close` 기준입니다. EMA448 계산에는 최소 448개 이상의 일봉이 필요하지만, EMA224 또는 EMA448이 없으면 장기 EMA 조건에서는 통과할 수 있습니다. 실제 데이터 수집은 캘린더 기준 `--days 700` 이상을 권장합니다.

필요하면 테스트 목적으로 EMA 필터를 끌 수 있습니다.

```bash
USE_EMA_BEARISH_FILTER=0 npm run screen
```

## 추세 계산 가격

추세선, slope, angleDegree, rSquared, returnRate 계산에는 항상 고가 `high`를 사용합니다.

```js
trendPrice = candle.high
```

스크리닝 결과에는 회귀선상 다음 봉 x좌표의 기준가도 저장합니다. 이 값은 필터 조건에는 사용하지 않고, 외부 실시간 비교 프로그램에서 `filtered_stocks.trend_next_price`를 읽어 활용할 수 있습니다.

```js
trendNextY = slopePixel * trendNextX + regressionIntercept
trendNextPrice = maxPrice - ((trendNextY - margin.top) / plotHeight) * (maxPrice - minPrice)
```

봉차트 렌더링은 실제 `open/high/low/close`를 사용하고, EMA와 MA5 관련 판단은 기존처럼 `close` 기준을 유지합니다.

## 각도 계산

가격 변화율이 아니라 실제 16:9 차트 plot 영역에 표시되는 좌표 기울기를 기준으로 계산합니다.

```js
virtualPeriod = period + rightPaddingBars
xPixel = margin.left + (index / (virtualPeriod - 1)) * plotWidth
yPixel = margin.top + (maxPrice - price) / (maxPrice - minPrice) * plotHeight
angleDegree = Math.atan(slopePixel) * 180 / Math.PI
```

화면 좌표에서는 아래로 갈수록 y가 커지므로 `slopePixel > 0`이면 우하향입니다.
`rightPaddingBars`는 마지막 봉 오른쪽에 빈 공간을 만들기 위한 가상 봉 개수이며, 회귀 계산과 차트 렌더링 x좌표에 동일하게 적용됩니다.

## MA5 돌파 감시

MA5 기준값은 DB에 저장된 완료 일봉 `close` 기준 EMA5입니다. 실시간 현재가는 EMA5 계산에 포함하지 않습니다.

상향 돌파 조건:

```js
previousPrice <= ma5Price && currentPrice > ma5Price
```

첫 조회 시 `previousPrice`가 없으면 최근 완료 일봉의 `previousClose`를 사용합니다. 같은 종목, 같은 기준일, 같은 `CROSS_ABOVE_MA5` 신호는 하루 1회만 저장됩니다.

## Quote Provider

현재 구현은 `src/quoteProviders/mockQuoteProvider.js`를 사용합니다. 실제 키움 OpenAPI, KIS API 등은 `fetchQuotes(codes, context)` 인터페이스를 맞춰 교체하면 됩니다.

## GitHub Pages 배포

`.github/workflows/deploy.yml`은 `main` push 시 실행됩니다.

1. 저장소를 checkout합니다.
2. repo에 올라간 `index.html`, `chart.html`, `assets/`를 Pages artifact로 복사합니다.
3. GitHub Pages에 정적 HTML만 배포합니다.

배포 과정에서는 DB 생성, KRX 수집, 스크리닝, HTML 생성을 하지 않습니다. 로컬에서 HTML을 생성한 뒤 정적 파일을 올리는 구조입니다.

## 로컬 미리보기

`chart.html`은 `assets/screening-runs.json`과 `assets/runs/run-{runId}.json`을 fetch하므로 `file://`로 직접 열면 브라우저 정책에 따라 실패할 수 있습니다. 아래처럼 로컬 서버로 확인하세요.

```bash
npm run preview
```

접속:

```text
http://localhost:8000/chart.html
```

GitHub Pages 설정에서 Source를 **GitHub Actions**로 지정하세요.

## REST API

API 서버 실행:

```bash
npm run api
```

필터링 결과 조회:

```bash
curl http://127.0.0.1:3000/api/filtered-stocks/latest
```

짭쩡 결과 조회:

```bash
curl 'http://127.0.0.1:3000/api/filtered-stocks/latest?screen_type=JJAP_SUBAK'
```

screening run 목록 조회:

```bash
curl http://127.0.0.1:3000/api/screening-runs
```

기본 응답은 최근 20개 run이며, 더 많이 보려면 `?limit=50`처럼 지정할 수 있습니다.

특정 run의 필터링 결과와 DB 최신 종가 비교:

```bash
curl 'http://127.0.0.1:3000/api/filtered-stocks?run_id=15&include_current=true'
```

매수 신호 조회:

```bash
curl http://127.0.0.1:3000/api/buy-signals/latest
```

특정 종목 조회:

```bash
curl http://127.0.0.1:3000/api/stocks/005930
```

API key 사용:

```bash
API_KEY=my-secret npm run api
curl -H "x-api-key: my-secret" http://127.0.0.1:3000/api/filtered-stocks/latest
```

## 주의사항

- JSON 저장 방식은 사용하지 않습니다.
- DB가 단일 데이터 원본입니다.
- `chart.html`은 브라우저에서 SQLite를 직접 읽지 않고, `generate` 시점의 DB 데이터를 HTML 안에 포함합니다.
- 매수 주문 실행은 구현하지 않았습니다.
- 실거래 적용 전 실제 quote provider, 장 운영 시간, 중복 신호 정책, 리스크 조건을 별도로 검증해야 합니다.
