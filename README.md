# 실제 주가 데이터 기반 우하향 추세 종목 스크리너

한국 주식 OHLCV 데이터에서 최근일을 종료점으로 고정한 강한 우하향 종목을 찾고, 키움 HTS 느낌의 SVG 봉차트 대시보드로 보여주는 정적 웹 프로그램입니다. `data/stocks.json`에 실제 데이터가 있으면 실제 데이터를 사용하고, 파일이 없거나 비어 있으면 샘플 데이터를 자동 생성합니다.

## 설치

```bash
npm install
```

외부 차트 라이브러리는 사용하지 않습니다. 빌드와 차트 생성은 순수 Node.js/JavaScript로 동작합니다.

## 샘플 데이터 실행

`data/stocks.json`이 비어 있거나 유효 데이터가 없으면 샘플 데이터 300종목, 120봉을 생성합니다.

```bash
npm run generate
open dist/chart.html
```

실행 시 `dataSource`, 종목 수, `strictResults`, `demoResults`가 콘솔에 출력됩니다.

## 실제 데이터 수집

FinanceDataReader를 설치한 뒤 KOSPI/KOSDAQ OHLCV를 수집할 수 있습니다. 기본 종료일은 전일입니다. 장중 미완성 캔들이 섞이지 않도록 오늘 데이터는 기본으로 가져오지 않습니다.

```bash
pip install finance-datareader
python3 scripts/fetch-krx-data.py --days 180
npm run generate
open dist/chart.html
```

테스트용으로 일부 종목만 수집하려면 `--max-stocks`를 사용합니다.

```bash
python3 scripts/fetch-krx-data.py --days 180 --max-stocks 100
```

특정 종료일을 지정하려면 `--end-date`를 사용합니다.

```bash
python3 scripts/fetch-krx-data.py --days 180 --end-date 2026-05-12
```

수집 실패 종목은 건너뛰고 계속 진행합니다. 결과는 날짜가 붙은 스냅샷과 최신 메타데이터로 저장됩니다.

```text
data/stocks-YYYY-MM-DD.json
data/latest.json
data/stocks.json
```

`data/stocks.json`은 기존 호환용 복사본입니다. 앱은 `data/latest.json`이 있으면 해당 날짜의 `stocks-YYYY-MM-DD.json`을 우선 읽습니다.

## data/stocks.json 형식

```json
[
  {
    "code": "005930",
    "name": "삼성전자",
    "market": "KOSPI",
    "prices": [
      {
        "date": "2026-01-02",
        "open": 72000,
        "high": 73500,
        "low": 71000,
        "close": 71500,
        "volume": 12345678
      }
    ]
  }
]
```

내부 로더는 날짜 오름차순 정렬, OHLC 숫자 검증, `high/low` 보정, 유효 캔들 부족 종목 제외를 수행합니다.

## npm scripts

| Script | Command | 설명 |
| --- | --- | --- |
| `npm run fetch:krx` | `python3 scripts/fetch-krx-data.py` | FinanceDataReader로 KRX 전체 데이터를 전일 기준으로 수집합니다. |
| `npm run generate` | `node src/index.js` | 데이터 로딩, 분석, `chart.html`/`dist/chart.html` 생성을 실행합니다. |
| `npm run build` | `npm run generate` | GitHub Pages 배포용 정적 파일을 생성합니다. |
| `npm start` | `npm run generate` | 로컬 실행 alias입니다. |

## 주요 옵션

```js
{
  renderPeriod: 80,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  minAngleDegree: 29,
  minReturnRate: -5,
  minRSquared: 0.5,
  showSelectedPriceLine: true,
  showRegressionLine: true,
  showMatchedArea: true,
  showCandleWick: true
}
```

strict 조건도 함께 실행합니다.

```js
{
  minAngleDegree: 45,
  minReturnRate: -10,
  minRSquared: 0.6
}
```

## 필터 조건

검색 종료일은 항상 가장 최근 거래일입니다. 최근 10봉, 11봉, 12봉처럼 시작일만 과거로 확장해 최대 60봉까지 검사합니다.

우하향 판정:

```js
slopePixel > 0 &&
angleDegree >= minAngleDegree &&
rSquared >= minRSquared &&
returnRate <= minReturnRate
```

여러 구간이 조건을 만족하면 각도, R², 수익률, 구간 길이 순으로 대표 구간을 고릅니다.

## selectedPrice 규칙

추세 계산에는 `selectedPrice`를 사용합니다.

```js
selectedPrice = close >= open ? close : open;
```

봉차트 렌더링은 실제 `open/high/low/close` 전체를 사용합니다.

## 차트 각도 계산

가격 변화율이 아니라 실제 16:9 SVG plot 영역에 그렸을 때 보이는 기울기를 계산합니다.

```js
xPixel = margin.left + (index / (period - 1)) * plotWidth
yPixel = margin.top + (maxPrice - price) / (maxPrice - minPrice) * plotHeight
angleDegree = Math.atan(slopePixel) * 180 / Math.PI
```

화면 좌표계에서는 오른쪽으로 갈수록 `yPixel`이 증가하면 우하향이므로 `slopePixel > 0`입니다.

## 화면 기능

- 검색 조건 변경 후 재검색
- 검색 결과/전체 종목 보기 전환
- 정렬
- CSV 다운로드
- 키움 HTS 스타일 봉차트
- selectedPrice 라인
- 회귀 추세선
- 검색 구간 강조
- 이동평균선 5/20/60/120
- 마우스 오버 툴팁
- `Ctrl + 휠` 또는 `Alt + 휠` 차트 확대/축소
- 드래그로 차트 viewport 이동
- 맨 위/맨 끝 이동 버튼

## GitHub Pages 배포

 GitHub 저장소 `Settings > Pages`에서 Source를 `GitHub Actions`로 설정합니다. `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 실행되어 `npm run build` 후 `dist` 폴더를 Pages에 배포합니다.

워크플로는 매일 08:00 KST에도 자동 실행됩니다. 스케줄 실행과 수동 실행에서는 FinanceDataReader를 설치하고 전체 KRX 데이터를 전일 기준으로 다시 수집한 뒤 `dist`를 배포합니다. 생성된 날짜별 데이터 파일과 `latest.json`도 `dist/data`에 함께 복사됩니다.

## 주의사항

- `data/latest.json` 또는 `data/stocks-YYYY-MM-DD.json`이 있으면 최신 날짜 스냅샷을 우선 사용합니다.
- 날짜별 스냅샷이 없고 `data/stocks.json`도 비어 있으면 샘플 데이터로 fallback됩니다.
- 실제 데이터 수집은 FinanceDataReader와 네트워크 상태에 따라 실패할 수 있습니다.
- GitHub Actions push 빌드는 저장소 데이터를 사용하고, 매일 배치/수동 실행은 데이터를 새로 수집합니다.
- 샘플 데이터는 테스트용이며 투자 판단용 데이터가 아닙니다.
