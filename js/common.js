let originalAllStoresGeoJSON = null;
let currentCodeFilteredGeoJSON = null;
let currentDisplayedGeoJSON = null;
const BRAND_STORAGE_KEY = 'selectedBrandFilters';
const BRAND_KEYS = ['matsuya', 'matsunoya', 'mycurry', 'other', 'specialty'];
const [mapCenter, mapZoom] = initCenterZoom();

const map = new maplibregl.Map({
	container: 'map',
	style: 'https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/pale.json',
	center: mapCenter,
	zoom: mapZoom
});

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl(), 'bottom-right');
map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

// 地図の初期化
map.on('load', async() => {
	const allStores = await csvToGeoJSON('./data/matsuyafoods.csv');

	map.addSource('allStores', {
		type: 'geojson',
		data: allStores
	});

	map.addLayer({
		id: 'allStoresLayer',
		type: 'circle',
		source: 'allStores',
        layout: {
            'circle-sort-key': [
                'match',
				['get', 'primary_brand'],
                '松屋', 2,          // 最上位
                '松のや', 1,
                'マイカリー食堂', 0,
				-1                  // その他
            ]
        },
		paint: {
            'circle-radius': [
                'interpolate', ['linear'],
                ['zoom'],
                5, 2, // ズーム5では半径2px
                10, 6, // ズーム10では半径6px
                15, 10 // ズーム15では半径10px
            ],
			'circle-color': [
				'match', ['get', 'color_brand'],
				'松屋', '#ea571e',
				'松のや', '#00489a',
				'すし松', '#000000',
				'マイカリー食堂', '#e7b61b',
				'松軒中華食堂', '#ea2f3d',
				'松太郎', '#ea2f3d',
				'松弁KITCHEN', '#750001',
				'ステーキ屋松', '#e13831',
				'ステーキ定食 松牛', '#e13831',
				'カフェ テラスヴェルト', '#005634',
				'福松', '#9eb18a',
				'麦のトリコ', '#eccc6c',
				'トゥックントゥックン', '#c30511',
				'その他', '#666666',
				/* default */ '#aaaaaa'
			]
		}
	});

    originalAllStoresGeoJSON = allStores;
	currentCodeFilteredGeoJSON = allStores;
	currentDisplayedGeoJSON = allStores;

	const savedCodeFilter = localStorage.getItem('selectedCodeFilter') || 'all';

	// フィルター要素を復元
	document.getElementById('codeFilterSelect').value = savedCodeFilter;
	restoreBrandFilters();

	// フィルター再適用
	await applyCodeFilter(savedCodeFilter);

});

// ズームレベルをLocalStorageに保存
map.on("moveend", () => {
    const center = map.getCenter();
    const zoom = map.getZoom();

    localStorage.setItem("mapCenter", JSON.stringify([center.lng, center.lat]));
    localStorage.setItem("mapZoom", zoom);
});

// カーソルをポインターに変更
map.on('mouseenter', 'allStoresLayer', () => {
	map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'allStoresLayer', () => {
	map.getCanvas().style.cursor = '';
});

// 地図の中心とズームレベルを初期化
function initCenterZoom() {
	// デフォルト設定
	const defaultCenter = [136.2923, 35.3622];
	const defaultZoom = 5;

	// localStorageから取得
	const savedCenter = localStorage.getItem("mapCenter");
	const savedZoom = localStorage.getItem("mapZoom");

	// 保存された値を使用
	const mapCenter = savedCenter ? JSON.parse(savedCenter) : defaultCenter;
	const mapZoom = savedZoom ? parseFloat(savedZoom) : defaultZoom;

	return [mapCenter, mapZoom];
}

// 地図の中心とズームレベルを保存
function saveCenterZoom(center, zoom) {
	localStorage.setItem("mapCenter", JSON.stringify(center));
	localStorage.setItem("mapZoom", zoom);
}

// ポップアップの表示
map.on('click', 'allStoresLayer', (e) => {
	const clickedFeature = e.features[0];
	// clickイベントのpropertiesには省略が混ざるため、表示中GeoJSONの完全データを引き直す
	const popupFeature = findFeatureByCode(clickedFeature?.properties?.code) || clickedFeature;
	const popupProperties = popupFeature.properties || clickedFeature.properties;
	const {
		store_name,
	} = popupProperties;

    // 店舗名から括弧と中身を削除
    const cleanStoreName = store_name.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();

    // 検索用にエンコードした店舗名
    const encodedStoreName = encodeURIComponent(cleanStoreName);

    // GoogleマップとAppleマップのURL
    const googleMapsUrl = `https://www.google.com/maps/search/${encodedStoreName}`;
    const appleMapsUrl = `http://maps.apple.com/?q=${encodedStoreName}`;
			// 公式サイトは主店舗+併設ブランドの全リンクをまとめて生成する
			const officialSiteLinks = buildOfficialSiteLinks(popupProperties);
			const officialLinksHTML = officialSiteLinks.map(link => {
				const theme = getBrandTheme(link.colorBrand || link.label);
				const officialSiteUrl = `https://pkg.navitime.co.jp/matsuyafoods/spot/detail?code=${link.code}`;
				return `<a href="${officialSiteUrl}" target="_blank" rel="noopener" class="map-link official-link" style="background:${theme.background};color:${theme.color};">${link.label}</a>`;
			}).join('');

    // ポップアップのHTML
    const popupHTML = `
		<div class="store-popup">
			<strong class="store-name">${store_name}</strong>
			<div class="official-links">
				${officialLinksHTML}
			</div>
			<div class="map-links">
				<a href="${googleMapsUrl}" target="_blank" rel="noopener" class="map-link google">
				Googleマップ
				</a>
				<a href="${appleMapsUrl}" target="_blank" rel="noopener" class="map-link apple">
				Appleマップ
				</a>
			</div>
		</div>
    `;

    new maplibregl.Popup()
		.setLngLat(clickedFeature.geometry.coordinates)
        .setHTML(popupHTML)
        .addTo(map);
});

// CSVをGeoJSONに変換
async function csvToGeoJSON(csvUrl) {
	return fetch(csvUrl)
		.then(res => res.text())
		.then(csvText => {
			const parsed = Papa.parse(csvText, {
				header: true,
				skipEmptyLines: true
			});

			// 可変フォーマットCSVを共通形に正規化（旧フォーマット座標ずれもここで吸収）
			const normalizedRows = parsed.data.map(row => {
				const brandCode = parseInt(row.brand, 10) || 0;
				const rawBname = typeof row.bname === 'string' ? row.bname.trim() : '';
				let bname = rawBname;

				let lon = parseFloat(row.longitude);
				let lat = parseFloat(row.latitude);

				// bname列が未設定の行（旧フォーマット互換）は座標列を補正する
				if (!Number.isFinite(lat)) {
					const shiftedLon = parseFloat(row.bname);
					const shiftedLat = parseFloat(row.longitude);
					if (Number.isFinite(shiftedLon) && Number.isFinite(shiftedLat)) {
						lon = shiftedLon;
						lat = shiftedLat;
						bname = '';
					}
				}

				if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
					return null;
				}

				const parsedMain = parseInt(row.main, 10);
				const mainFlag = Number.isNaN(parsedMain) ? 1 : parsedMain;
				const brandFlags = decodeBrandFlags(brandCode);
				const rowPrimaryBrand = resolveRowPrimaryBrand(row.name, brandFlags, bname);
				const rowColorBrand = resolveColorBrand(brandFlags, bname, rowPrimaryBrand);
				const coordKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;

				return {
					code: row.code,
					storeName: row.name,
					mainFlag,
					brandCode,
					bname,
					brandFlags,
					rowPrimaryBrand,
					rowColorBrand,
					lon,
					lat,
					coordKey
				};
			}).filter(Boolean);

			// 同一座標+同一brand_code単位で、ブランド側の名称/コードを逆引きできる辞書を作る
			const subStoresByCoordBrand = new Map();
			normalizedRows.forEach(row => {
				const filterKey = getFilterKeyFromBrandName(row.rowPrimaryBrand);
				if (!filterKey) {
					return;
				}

				const key = `${row.coordKey}|${row.brandCode}`;
				const subStores = subStoresByCoordBrand.get(key) || {};
				subStores[filterKey] = {
					code: row.code,
					store_name: row.storeName,
					color_brand: row.rowColorBrand,
					brand_name: row.rowPrimaryBrand,
					main: row.mainFlag
				};
				subStoresByCoordBrand.set(key, subStores);
			});

			// 地図描画の実体はmain!=0を採用し、表示名や公式リンクはsub_store_labelsで補完する
			const mainRows = normalizedRows.filter(row => row.mainFlag !== 0);

			// 使用済みの座標を記録する（重複チェック）
			const usedCoords = new Map();

			return {
				type: "FeatureCollection",
				features: mainRows.map(row => {
					let lon = row.lon;
					let lat = row.lat;
					const key = row.coordKey;

					// 重複がある場合はオフセットを少し加える
					let offsetCount = usedCoords.get(key) || 0;
					const offsetStep = 0.00005; // 約5〜6mずらす

					lat += offsetStep * offsetCount;
					lon += offsetStep * offsetCount;
					usedCoords.set(key, offsetCount + 1);

					// ポップアップ差し替え用: 同座標・同ブランドコードの併設候補を紐づける
					const subStoreKey = `${row.coordKey}|${row.brandCode}`;

					return {
						type: "Feature",
						properties: {
							code: row.code,
							store_name: row.storeName,
							main: row.mainFlag,
							brand_code: row.brandCode,
							bname: row.bname,
							primary_brand: row.rowPrimaryBrand,
							color_brand: row.rowColorBrand,
							has_matsuya: row.brandFlags.matsuya,
							has_matsunoya: row.brandFlags.matsunoya,
							has_mycurry: row.brandFlags.mycurry,
							has_other: row.brandFlags.other,
							sub_store_labels: subStoresByCoordBrand.get(subStoreKey) || null
						},
						geometry: {
							type: "Point",
							coordinates: [lon, lat]
						}
					};
				})
			};
		});
}

// ブランド判定ヘルパー
function decodeBrandFlags(brandCode) {
	const code = Number.isFinite(brandCode) ? brandCode : 0;
	return {
		matsuya: code % 10 === 1,
		matsunoya: Math.floor(code / 10) % 10 === 1,
		mycurry: Math.floor(code / 100) % 10 === 1,
		other: Math.floor(code / 1000) % 10 === 1
	};
}

function resolvePrimaryBrand(brandFlags) {
	if (brandFlags.matsuya) {
		return '松屋';
	}
	if (brandFlags.matsunoya) {
		return '松のや';
	}
	if (brandFlags.mycurry) {
		return 'マイカリー食堂';
	}
	return 'その他';
}

function resolveRowPrimaryBrand(storeName, brandFlags, bname) {
	const normalizedName = typeof storeName === 'string' ? storeName.trim() : '';
	if (normalizedName.startsWith('松屋')) {
		return '松屋';
	}
	if (normalizedName.startsWith('松のや')) {
		return '松のや';
	}
	if (normalizedName.startsWith('マイカリー食堂')) {
		return 'マイカリー食堂';
	}
	if (brandFlags.other && bname) {
		return bname;
	}
	return resolvePrimaryBrand(brandFlags);
}

function getFilterKeyFromBrandName(brandName) {
	if (brandName === '松屋') {
		return 'matsuya';
	}
	if (brandName === '松のや') {
		return 'matsunoya';
	}
	if (brandName === 'マイカリー食堂') {
		return 'mycurry';
	}
	if (brandName) {
		return 'other';
	}
	return null;
}

function resolveColorBrand(brandFlags, bname, primaryBrand = resolvePrimaryBrand(brandFlags)) {
	if (brandFlags.other && bname) {
		return bname;
	}
	return primaryBrand;
}

function getBrandColor(brandName) {
	if (brandName === '松屋') {
		return '#ea571e';
	}
	if (brandName === '松のや') {
		return '#00489a';
	}
	if (brandName === 'すし松') {
		return '#000000';
	}
	if (brandName === 'マイカリー食堂') {
		return '#e7b61b';
	}
	if (brandName === '松軒中華食堂' || brandName === '松太郎') {
		return '#ea2f3d';
	}
	if (brandName === '松弁KITCHEN') {
		return '#750001';
	}
	if (brandName === 'ステーキ屋松' || brandName === 'ステーキ定食 松牛') {
		return '#e13831';
	}
	if (brandName === 'カフェ テラスヴェルト') {
		return '#005634';
	}
	if (brandName === '福松') {
		return '#9eb18a';
	}
	if (brandName === '麦のトリコ') {
		return '#eccc6c';
	}
	if (brandName === 'トゥックントゥックン') {
		return '#c30511';
	}
	return '#666666';
}

function getBrandTheme(brandName) {
	const background = getBrandColor(brandName);
	const darkTextBrands = ['マイカリー食堂', '福松', '麦のトリコ'];
	return {
		background,
		color: darkTextBrands.includes(brandName) ? '#222222' : '#ffffff'
	};
}

// 公式サイトリンクは主店舗を先頭に、併設ブランド側リンクを重複なく追加する
function buildOfficialSiteLinks(properties) {
	const links = [];
	const usedLinkKeys = new Set();

	const addLink = (code, label, colorBrand) => {
		if (!code || !label) {
			return;
		}
		const linkKey = `${code}|${label}`;
		if (usedLinkKeys.has(linkKey)) {
			return;
		}
		links.push({
			code,
			label,
			colorBrand: colorBrand || label
		});
		usedLinkKeys.add(linkKey);
	};

	const primaryCode = properties.primary_code || properties.code;
	const primaryBrand = properties.primary_brand || '公式サイト';
	const primaryColorBrand = properties.primary_color_brand || properties.color_brand || primaryBrand;
	addLink(primaryCode, primaryBrand, primaryColorBrand);

	const subStoreLabels = properties.sub_store_labels || {};
	Object.values(subStoreLabels).forEach(subStore => {
		addLink(
			subStore.code,
			subStore.brand_name || subStore.store_name || '公式サイト',
			subStore.color_brand || subStore.brand_name
		);
	});

	const preferredOrder = ['松屋', '松のや', 'マイカリー食堂'];
	links.sort((a, b) => {
		const aIndex = preferredOrder.indexOf(a.label);
		const bIndex = preferredOrder.indexOf(b.label);
		const aScore = aIndex === -1 ? preferredOrder.length : aIndex;
		const bScore = bIndex === -1 ? preferredOrder.length : bIndex;
		if (aScore !== bScore) {
			return aScore - bScore;
		}
		return a.label.localeCompare(b.label, 'ja');
	});

	return links;
}

function normalizeStoreCode(code) {
	const value = String(code ?? '').trim();
	const noLeadingZero = value.replace(/^0+/, '');
	return noLeadingZero || '0';
}

// 表示中GeoJSONから該当店舗を特定し、ポップアップで使う完全プロパティを取得する
function findFeatureByCode(code) {
	const normalizedCode = normalizeStoreCode(code);
	const features = currentDisplayedGeoJSON?.features || [];
	return features.find(feature =>
		normalizeStoreCode(feature?.properties?.code) === normalizedCode
	) || null;
}

function getSelectedBrandFilters() {
	return Array.from(document.querySelectorAll('input[name="brandFilter"]:checked'))
		.map(input => input.value)
		.filter(value => BRAND_KEYS.includes(value));
}

function saveSelectedBrandFilters() {
	localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(getSelectedBrandFilters()));
}

function enforceSpecialtySelectionRule() {
	const checkboxes = Array.from(document.querySelectorAll('input[name="brandFilter"]'));
	if (!checkboxes.length) {
		return;
	}

	const specialtyCheckbox = checkboxes.find(checkbox => checkbox.value === 'specialty');
	if (!specialtyCheckbox) {
		return;
	}

	const checkedNonSpecialtyCount = checkboxes.filter(checkbox =>
		checkbox.value !== 'specialty' && checkbox.checked
	).length;

	if (checkedNonSpecialtyCount >= 2) {
		specialtyCheckbox.checked = false;
	}
}

function restoreBrandFilters() {
	const checkboxes = document.querySelectorAll('input[name="brandFilter"]');
	if (!checkboxes.length) {
		return;
	}

	let selectedFilters = [];
	const savedFilters = localStorage.getItem(BRAND_STORAGE_KEY);

	if (savedFilters) {
		try {
			const parsed = JSON.parse(savedFilters);
			if (Array.isArray(parsed)) {
				selectedFilters = parsed.filter(value => BRAND_KEYS.includes(value));
			}
		} catch (e) {
			selectedFilters = [];
		}
	} else {
		const legacyBrand = localStorage.getItem('selectedBrand');
		const legacyMap = {
			'松屋': 'matsuya',
			'松のや': 'matsunoya',
			'マイカリー食堂': 'mycurry'
		};
		if (legacyBrand && legacyBrand !== 'all') {
			selectedFilters = [legacyMap[legacyBrand] || 'other'];
		}
	}

	checkboxes.forEach(checkbox => {
		checkbox.checked = selectedFilters.includes(checkbox.value);
	});

	enforceSpecialtySelectionRule();
}

function hasBrandFlag(feature, filterKey) {
	if (filterKey === 'matsuya') {
		return Boolean(feature.properties.has_matsuya);
	}
	if (filterKey === 'matsunoya') {
		return Boolean(feature.properties.has_matsunoya);
	}
	if (filterKey === 'mycurry') {
		return Boolean(feature.properties.has_mycurry);
	}
	if (filterKey === 'other') {
		return Boolean(feature.properties.has_other);
	}
	return false;
}

function getBrandOnlyFilters(selectedBrandFilters) {
	return selectedBrandFilters.filter(filterKey => filterKey !== 'specialty');
}

function isStandaloneStore(feature) {
	const brandFlagCount = [
		feature.properties.has_matsuya,
		feature.properties.has_matsunoya,
		feature.properties.has_mycurry,
		feature.properties.has_other
	].filter(Boolean).length;

	return brandFlagCount <= 1;
}

function matchesBrandFilter(feature, selectedBrandFilters) {
	if (!selectedBrandFilters.length) {
		return true;
	}

	const brandFilters = getBrandOnlyFilters(selectedBrandFilters);
	const matchesBrand = !brandFilters.length || brandFilters.every(filterKey => hasBrandFlag(feature, filterKey));
	if (!matchesBrand) {
		return false;
	}

	if (selectedBrandFilters.includes('specialty')) {
		return isStandaloneStore(feature);
	}

	return true;
}

// 単一/複数選択に応じて、表示する店舗名・色・公式リンクcodeをブランド側へ寄せる
function getDisplayFeatureForSelectedBrand(feature, selectedBrandFilters) {
	const brandFilters = getBrandOnlyFilters(selectedBrandFilters);
	if (!brandFilters.length) {
		return feature;
	}

	const subStoreLabels = feature.properties.sub_store_labels;
	if (!subStoreLabels) {
		return feature;
	}

	const primaryBrandKey = getFilterKeyFromBrandName(feature.properties.primary_brand);
	const isPrimaryBrandSelected = brandFilters.includes(primaryBrandKey);

	if (isPrimaryBrandSelected) {
		return feature;
	}

	const selectedBrandKey = brandFilters.find(filterKey => Boolean(subStoreLabels[filterKey]));
	if (!selectedBrandKey) {
		return feature;
	}

	const subStore = subStoreLabels[selectedBrandKey];
	if (!subStore) {
		return feature;
	}

	return {
		...feature,
		properties: {
			...feature.properties,
			primary_code: feature.properties.primary_code || feature.properties.code,
			primary_color_brand: feature.properties.primary_color_brand || feature.properties.color_brand,
			code: subStore.code || feature.properties.code,
			store_name: subStore.store_name || feature.properties.store_name,
			color_brand: subStore.color_brand || feature.properties.color_brand
		}
	};
}

// ブランド選択イベント
document.querySelectorAll('input[name="brandFilter"]').forEach(checkbox => {
	checkbox.addEventListener('change', () => {
		enforceSpecialtySelectionRule();
		saveSelectedBrandFilters();
		applyBrandFilter();
	});
});

// 店舗限定選択イベント
document.getElementById('codeFilterSelect').addEventListener('change', async (e) => {
	const codeFile = e.target.value;
	localStorage.setItem('selectedCodeFilter', codeFile); // 保存
	await applyCodeFilter(codeFile);
});

// ブランドフィルター適用処理（複数選択時はAND）
function applyBrandFilter() {
	if (!currentCodeFilteredGeoJSON || !map.getSource('allStores')) {
		return;
	}

	const selectedBrandFilters = getSelectedBrandFilters();
	// 1) ブランド条件で抽出 2) 表示名/コードを選択ブランド側に差し替え
	const filteredFeatures = currentCodeFilteredGeoJSON.features
		.filter(feature => matchesBrandFilter(feature, selectedBrandFilters))
		.map(feature => getDisplayFeatureForSelectedBrand(feature, selectedBrandFilters));

	currentDisplayedGeoJSON = {
		type: 'FeatureCollection',
		features: filteredFeatures
	};

	map.getSource('allStores').setData(currentDisplayedGeoJSON);
	updateFilteredStoreCount();
}

// 店舗限定フィルター適用処理
async function applyCodeFilter(selectedFile) {
	if (selectedFile === 'all') {
		currentCodeFilteredGeoJSON = originalAllStoresGeoJSON;
		applyBrandFilter();
		return;
	}

	const response = await fetch(`./data/${selectedFile}`);
	const csvText = await response.text();
	const parsed = Papa.parse(csvText, {
		header: false,
		skipEmptyLines: true
	});
	const codeSet = new Set(parsed.data.map(row => row[0]));

	const filteredFeatures = originalAllStoresGeoJSON.features.filter(f =>
		codeSet.has(f.properties.code)
	);

	currentCodeFilteredGeoJSON = {
		type: 'FeatureCollection',
		features: filteredFeatures
	};

	applyBrandFilter();
}

function updateFilteredStoreCount() {
	const countElement = document.getElementById('storeCountValue');
	if (!countElement) {
		return;
	}

	const visibleFeatures = currentDisplayedGeoJSON?.features || [];
	countElement.textContent = `${visibleFeatures.length}件`;
}
