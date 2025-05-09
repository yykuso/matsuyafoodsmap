let originalAllStoresGeoJSON = null;
const [mapCenter, mapZoom] = initCenterZoom();

const map = new maplibregl.Map({
	container: 'map',
	style: 'https://tile.openstreetmap.jp/styles/openmaptiles/style.json',
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

});

// ポップアップの表示
map.on('click', 'allStoresLayer', (e) => {
	const feature = e.features[0];
	const {
		store_name,
	} = feature.properties;

	new maplibregl.Popup()
		.setLngLat(feature.geometry.coordinates)
		.setHTML(`<strong>${store_name}</strong>`)
		.addTo(map);
});

// カーソルをポインターに変更
map.on('mouseenter', 'allStoresLayer', () => {
	map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'allStoresLayer', () => {
	map.getCanvas().style.cursor = '';
});

// ズームレベルをCookieに保存
map.on("moveend", () => {
    const center = map.getCenter();
    const zoom = map.getZoom();

    // Cookieに保存
    setCookie("mapCenter", JSON.stringify([center.lng, center.lat]), 30);
    setCookie("mapZoom", zoom, 30);
});

// ブランドフィルターの変更
document.getElementById('brandSelect').addEventListener('change', (e) => {
	const brand = e.target.value;
	if (brand === 'all') {
		map.setFilter('allStoresLayer', null); // 全表示
	} else {
		map.setFilter('allStoresLayer', ['==', ['get', 'brand'], brand]);
	}
});

// Codeフィルターの変更
document.getElementById('codeFilterSelect').addEventListener('change', async (e) => {
	const selectedFile = e.target.value;

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

});

// Cookie関連
function initCenterZoom() {
    // デフォルト設定
    const defaultCenter = [136.2923, 35.3622];
    const defaultZoom = 5;

    // Cookieから情報を取得
    const savedCenter = getCookie("mapCenter");
    const savedZoom = getCookie("mapZoom");

    // 保存された値を使用
    const mapCenter = savedCenter ? JSON.parse(savedCenter) : defaultCenter;
    const mapZoom = savedZoom ? parseFloat(savedZoom) : defaultZoom;

    return [mapCenter, mapZoom];
}

function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
    const cookies = document.cookie.split("; ");
    for (let cookie of cookies) {
        const [key, value] = cookie.split("=");
        if (key === name) {
            return decodeURIComponent(value);
        }
    }
    return null;
}


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