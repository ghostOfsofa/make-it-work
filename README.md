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

생성된 파일을 브라우저에서 열면 `demoResults` 상위 5개 종목의 키움 HTS 스타일 SVG 봉차트를 확인할 수 있습니다.

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

차트 조작:

- 마우스 휠 위: 봉 확대, 표시 봉 개수 감소
- 마우스 휠 아래: 봉 축소, 표시 봉 개수 증가
- 드래그: viewport를 과거/최근 방향으로 이동
- 렌더링 범위: 최소 30봉, 최대 200봉

봉차트는 실제 `open`, `high`, `low`, `close` 값을 사용합니다. `selectedPrice`는 추세선 계산과 점선 라인 표시에만 사용됩니다. 고가와 저가는 캔들 위아래 꼬리로 표시됩니다. 양봉은 빨간색, 음봉은 파란색으로 표시합니다.

차트 렌더링은 전체 `1600x900` SVG 안에서 아래 margin을 제외한 plot 영역을 기준으로 계산합니다. 화면에 표시되는 기울기와 회귀선 각도 계산이 일치하도록 selectedPrice 회귀도 plot 좌표계에서 수행합니다.

```js
margin = {
  top: 40,
  right: 90,
  bottom: 60,
  left: 30
};
```

## GitHub Pages 배포 방법

이 저장소는 GitHub Actions로 `chart.html`을 자동 생성하고 GitHub Pages에 배포하도록 구성되어 있습니다.

1. GitHub 저장소로 이동합니다.
2. `Settings`를 엽니다.
3. 왼쪽 메뉴에서 `Pages`를 선택합니다.
4. `Build and deployment`의 `Source`를 `GitHub Actions`로 설정합니다.
5. `main` 브랜치에 push합니다.
6. `.github/workflows/deploy.yml`이 `npm run build`를 실행합니다.
7. 빌드 과정에서 `dist/chart.html`이 생성되고 Pages artifact로 업로드됩니다.
8. 배포가 완료될 때까지 Actions 탭에서 `Deploy Charts` workflow를 확인합니다.

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
  renderPeriod: 60,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  chartType: "candlestick",
  showSelectedPriceLine: true,
  minAngleDegree: 45,
  minReturnRate: -10,
  minRSquared: 0.6
}
```

가격 선택 규칙은 다음과 같습니다.

```js
selectedPrice = close >= open ? close : open;
```

우하향 검색은 가장 최근 거래일을 종료점으로 고정하고, 최근 `scanMinPeriod`봉부터 `scanMaxPeriod`봉까지 구간을 하루씩 확장하며 검사합니다. 예를 들어 `scanMinPeriod: 10`, `scanMaxPeriod: 60`이면 최근 10봉, 11봉, 12봉, ..., 60봉을 순서대로 검사합니다.

조건을 만족하는 구간이 여러 개면 angleDegree, rSquared, returnRate, matchedPeriod 순으로 가장 강한 구간을 선택합니다.

차트 y축 스케일은 최근 N일의 `high`, `low` min/max에 위아래 약 5% 여백을 더해 잡습니다. 필터링 로직은 기존 요구대로 `selectedPrice` 기준 좌표 변환을 사용하고, 시각화용 각도와 회귀선은 실제 plot 영역 좌표 기준으로 다시 계산합니다.
