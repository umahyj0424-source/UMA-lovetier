# 애정말딸 (각질/거리별) — GitHub Pages 패키지 v1.2.1

단거리·마일·중거리·장거리·더트 × 도주·선행·선입·추입의 20칸에
좋아하는 우마무스메를 한 명씩 배치하는 정적 웹사이트입니다.

## 이번 ZIP에 포함된 것

- 사이트 본체: `index.html`, `style.css`, `app.js`
- 적성 데이터: `aptitude-data.js`
- 캐릭터 목록: `characters.json`, `characters.csv`
- 캐릭터 이미지 142장: `images/`
- 원본 추출 목록: `source-data/`
- GitHub Pages용 `.nojekyll`

`characters.json`의 이름은 `프로필 이미지` 문구를 제거했으며,
잘린 이름은 나무위키 문서 URL의 제목을 이용해 복원했습니다.

## GitHub에 올리는 방법

1. 이 ZIP을 압축 해제합니다.
2. GitHub에서 새 저장소를 만듭니다.
3. 압축을 푼 폴더 **안의 파일과 폴더 전체**를 저장소 최상위에 올립니다.
   - `index.html`이 저장소 맨 위에 보여야 합니다.
   - `images` 폴더도 함께 올라가야 합니다.
4. GitHub 저장소의 `Settings → Pages`로 이동합니다.
5. `Build and deployment`에서 다음과 같이 선택합니다.
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
6. `Save`를 누르고 배포가 끝날 때까지 기다립니다.

## 자동 데이터 불러오기

GitHub Pages에서 처음 접속하면 루트의 `characters.json`과 `images/`를 이용해
기본 캐릭터 142명을 자동으로 등록합니다.

브라우저에 저장되는 항목:

- 배치 결과: Local Storage
- 직접 추가한 캐릭터와 기본 캐릭터 목록 정보: IndexedDB

## 주요 기능

- 5개 거리 × 4개 각질, 총 20칸 배치
- 드래그 중 마우스 휠 스크롤
- 화면 오른쪽 빠른 배치표
- 카드 마우스 오버 시 거리·마장·각질 적성 표시
- `프로필 이미지` 앞 문구 자동 제거
- 이름 검색 및 배치 여부 필터
- 캐릭터 사진과 이름 직접 추가
- 결과 PNG 및 JSON 저장
- 새 다운로더 ZIP 또는 JSON+이미지 폴더로 데이터 갱신

## 로컬에서 확인하는 방법

자동 불러오기는 `fetch()`를 사용하므로 `index.html`을 파일로 직접 열면
브라우저 보안 정책에 따라 기본 데이터가 불러와지지 않을 수 있습니다.

Python이 설치되어 있다면 이 폴더에서 다음 명령을 실행하세요.

```bash
python -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000`을 엽니다.

## 데이터 파일

- `characters.json`: 사이트가 자동으로 읽는 목록
- `characters.csv`: 엑셀 확인용 목록
- `images/`: 사이트에 표시되는 캐릭터 이미지
- `source-data/characters-original.json`: 사용자가 제공한 원본 JSON
- `source-data/characters-original.csv`: 사용자가 제공한 원본 CSV

이미지와 문서 데이터의 권리는 각 원 권리자 및 출처의 이용 조건을 따릅니다.


## v1.2.1 수동 추가 캐릭터

- 맨하탄 카페
- 베르시나
- 에스푸아르 시티

이미지 파일만 `images/`에 넣으면 사이트 목록에는 나타나지 않습니다.
반드시 루트의 `characters.json`과 `characters.csv`에도 캐릭터 항목이 있어야 합니다.

맨하탄 카페는 첨부된 적성 DB에 육성 적성 정보가 있어 툴팁이 표시됩니다.
베르시나와 에스푸아르 시티는 첨부된 DB에 이름은 존재하지만
육성 카드 적성 행이 없어 툴팁에 해당 사유가 표시됩니다.
