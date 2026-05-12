# Strong Downtrend Stock Chart Filter

Node.js로 여러 종목의 일봉 데이터를 분석해, 16:9 차트 좌표계에서 강하게 우하향하는 종목을 필터링하고 SVG 봉차트 HTML을 생성하는 예제입니다.

## 설치 방법

이 프로젝트는 외부 라이브러리를 사용하지 않습니다. Node.js만 있으면 실행할 수 있습니다.

```bash
git clone https://github.com/ghostOfsofa/make-it-work.git
cd make-it-work
```

의존성이 없으므로 `npm install`은 필수는 아닙니다.

## 실행 방법

```bash
npm start
```

또는 직접 Node.js로 실행할 수 있습니다.

```bash
node index.js
```

실행하면 콘솔에 두 가지 결과가 `console.table`로 출력됩니다.

- `strictResults`: `minAngleDegree = 45`
- `demoResults`: `minAngleDegree = 29`

`minAngleDegree = 45`는 1600x900 좌표계와 현실적인 일봉 변동 제한에서는 결과가 거의 없을 수 있습니다. 그래서 차트 확인용으로 `minAngleDegree = 29` 데모 결과도 함께 생성합니다.

## chart.html 확인 방법

실행 후 루트 디렉터리에 `chart.html`이 생성됩니다.

```bash
npm run generate
```

생성된 파일을 브라우저에서 열면 `demoResults` 상위 5개 종목의 SVG 봉차트를 확인할 수 있습니다.

```bash
open chart.html
```

macOS가 아니라면 파일 탐색기에서 `chart.html`을 더블클릭하거나 브라우저 주소창에 파일 경로를 입력하면 됩니다.

차트에는 다음 정보가 표시됩니다.

- open/high/low/close 기준 캔들 봉차트
- selectedPrice 라인
- 선형회귀 추세선
- 회귀선 각도
- slopePixel
- rSquared
- returnRate
- minAngleDegree 기준선

봉차트는 실제 `open`, `high`, `low`, `close` 값을 사용합니다. `selectedPrice`는 추세선 계산과 점선 라인 표시에만 사용됩니다. 고가와 저가는 캔들 위아래 꼬리로 표시됩니다. 양봉은 빨간색, 음봉은 파란색으로 표시합니다.

## GitHub Pages 배포 방법

`chart.html`은 정적 HTML 파일이므로 GitHub Pages로 바로 배포할 수 있습니다.

1. GitHub 저장소로 이동합니다.
2. `Settings`를 엽니다.
3. 왼쪽 메뉴에서 `Pages`를 선택합니다.
4. `Build and deployment`의 `Source`를 `Deploy from a branch`로 설정합니다.
5. `Branch`를 `main`, 폴더를 `/root`로 선택합니다.
6. 저장 후 배포가 완료될 때까지 기다립니다.

배포 후 아래 형식의 URL에서 확인할 수 있습니다.

```text
https://ghostOfsofa.github.io/make-it-work/chart.html
```

## 예제 스크린샷

아래 영역에 GitHub Pages 또는 로컬 브라우저에서 확인한 차트 스크린샷을 추가할 수 있습니다.

```md
![Example chart screenshot](./docs/example-chart.png)
```

현재 저장소에는 별도 스크린샷 파일을 포함하지 않았습니다.

## npm scripts

| Script | Command | Description |
| --- | --- | --- |
| `npm start` | `npm run generate` | 샘플 주가 데이터를 생성하고 필터 결과와 `chart.html`을 생성합니다. |
| `npm run dev` | `npm run generate` | 개발 중 같은 생성 과정을 실행합니다. 별도 dev server는 사용하지 않습니다. |
| `npm run generate` | `node src/index.js` | 정적 배포용 `chart.html`과 `dist/chart.html`을 다시 생성합니다. |
| `npm run build` | `npm run generate` | GitHub Pages 배포용 `dist/chart.html`을 생성합니다. |

## 주요 파일

| File | Description |
| --- | --- |
| `strong-downtrend-filter.mjs` | selectedPrice 계산, 좌표 변환, 선형회귀, 필터링, 샘플 데이터 생성 로직 |
| `src/index.js` | 실행 진입점, SVG 봉차트 HTML 생성 및 저장 |
| `index.js` | 기존 `node index.js` 실행을 유지하는 wrapper |
| `chart.html` | 생성된 봉차트 확인용 정적 HTML |

## 필터 기준

기본 필터 옵션은 다음과 같습니다.

```js
{
  period: 20,
  chartWidth: 1600,
  chartHeight: 900,
  chartType: "candlestick",
  minAngleDegree: 45,
  minReturnRate: -10,
  minRSquared: 0.6
}
```

가격 선택 규칙은 다음과 같습니다.

```js
selectedPrice = close >= open ? close : open;
```

차트 y축 스케일은 최근 N일의 `open`, `high`, `low`, `close`, `selectedPrice` 전체 min/max를 기준으로 잡습니다. 필터링 로직은 기존 요구대로 `selectedPrice` 기준 좌표 변환을 사용합니다.
