let originalAllStoresGeoJSON = null;
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
                ['get', 'brand'],
                '松屋', 2,          // 最上位
                '松のや', 1,
                'マイカリー食堂', 0,
                -1                 // その他
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
				'match', ['get', 'brand'],
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
				/* default */ '#aaaaaa'
			]
		}
	});

    originalAllStoresGeoJSON = allStores;

	const savedBrand = localStorage.getItem('selectedBrand') || 'all';
	const savedCodeFilter = localStorage.getItem('selectedCodeFilter') || 'all';

	// セレクト要素に復元
	document.getElementById('brandSelect').value = savedBrand;
	document.getElementById('codeFilterSelect').value = savedCodeFilter;

	// フィルター再適用
	applyBrandFilter(savedBrand);
	applyCodeFilter(savedCodeFilter);

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
    const feature = e.features[0];
    const {
        store_name,
    } = feature.properties;

    // 店舗名から括弧と中身を削除
    const cleanStoreName = store_name.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();

    // 検索用にエンコードした店舗名
    const encodedStoreName = encodeURIComponent(cleanStoreName);

    // GoogleマップとAppleマップのURL
    const googleMapsUrl = `https://www.google.com/maps/search/${encodedStoreName}`;
    const appleMapsUrl = `http://maps.apple.com/?q=${encodedStoreName}`;

    // ポップアップのHTML
    const popupHTML = `
		<div class="store-popup">
			<strong class="store-name">${store_name}</strong>
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
        .setLngLat(feature.geometry.coordinates)
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

			// 使用済みの座標を記録する（重複チェック）
			const usedCoords = new Map();

			return {
				type: "FeatureCollection",
				features: parsed.data.map(row => {
					let lon = parseFloat(row.longitude);
					let lat = parseFloat(row.latitude);
					const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

					// 重複がある場合はオフセットを少し加える
					let offsetCount = usedCoords.get(key) || 0;
					const offsetStep = 0.00005; // 約5〜6mずらす

					lat += offsetStep * offsetCount;
					lon += offsetStep * offsetCount;
					usedCoords.set(key, offsetCount + 1);

					return {
						type: "Feature",
						properties: {
							code: row.code,
							store_name: row.name,
							brand: row.brand
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

// ブランド選択イベント
document.getElementById('brandSelect').addEventListener('change', (e) => {
	const brand = e.target.value;
	localStorage.setItem('selectedBrand', brand); // 保存
	applyBrandFilter(brand);
});

// 店舗限定選択イベント
document.getElementById('codeFilterSelect').addEventListener('change', async (e) => {
	const codeFile = e.target.value;
	localStorage.setItem('selectedCodeFilter', codeFile); // 保存
	await applyCodeFilter(codeFile);
});

// ブランドフィルター適用処理
function applyBrandFilter(brand) {
	if (brand === 'all') {
		map.setFilter('allStoresLayer', null);
	} else {
		map.setFilter('allStoresLayer', ['==', ['get', 'brand'], brand]);
	}
}

// 店舗限定フィルター適用処理
async function applyCodeFilter(selectedFile) {
	if (selectedFile === 'all') {
		map.getSource('allStores').setData(originalAllStoresGeoJSON);
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

	map.getSource('allStores').setData({
		type: 'FeatureCollection',
		features: filteredFeatures
	});
}

// ブランドと店舗限定の選択を保存する
document.addEventListener('DOMContentLoaded', () => {
	const brandSelect = document.getElementById('brandSelect');
	const codeFilterSelect = document.getElementById('codeFilterSelect');

  // 過去の選択を復元
	const savedBrand = localStorage.getItem('selectedBrand');
	const savedCodeFilter = localStorage.getItem('selectedCodeFilter');
	if (savedBrand && brandSelect) {
		brandSelect.value = savedBrand;
	}
	if (savedCodeFilter && codeFilterSelect) {
		codeFilterSelect.value = savedCodeFilter;
	}

  // 選択が変更されたときに保存
	brandSelect?.addEventListener('change', () => {
		localStorage.setItem('selectedBrand', brandSelect.value);
	});

	codeFilterSelect?.addEventListener('change', () => {
		localStorage.setItem('selectedCodeFilter', codeFilterSelect.value);
	});
});
