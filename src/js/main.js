import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { intervalToDuration } from 'date-fns';
import format from 'date-fns/format';
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';

let apikey = '48ce79e682e5e8f79e39cc1374871d75', //map tiles only; weather data now comes from our own server
	location_slug = new URLSearchParams(window.location.search).get('loc') || 'default',
	normal_interval = 10, //in minutes
	error_state = false,
	error_interval = 1, //in minutes
	update_interval = normal_interval,
	tg_chart_w, tg_chart_h, hg_chart_w, hg_chart_h,temp_grad, hum_grad,
	chart_ctx = document.querySelector('#wxchart canvas').getContext('2d'),
	wxdisplay = document.querySelector('#wxdisplay'),
	body = document.body,
	wxdata = {};

//everything shown — the current conditions, the chart history, and the
//day-over-day astro deltas — now arrives from the server on every fetch,
//so there is no local state to bootstrap here

const wxchart = new Chart(chart_ctx, {
	type:'line',
	data:{
		datasets:[{
			label:'Pressure',
			data: [],
			pointRadius:0,
			yAxisID:'y2',
			lineTension: .5,

			borderColor: 'rgba(255, 255, 255, .5)',
			backgroundColor: ctx => 'rgba(255, 255, 255, ' + ((ctx.raw) ? (ctx.raw.x < Date.now() ? '.75)' : '0)') : '.5)')},
		{
			label:'Humidity',
			data: [],
			lineTension: .5,
			pointRadius: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return ((context.raw) ? (context.raw.x < Date.now() ? 3 : 4) : 10);
			},
			borderColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return humidityGradient(ctx, chartArea);
			},
			backgroundColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return ((context.raw) ? (context.raw.x < Date.now() ? humidityGradient(ctx, chartArea) : 'rgba(0, 0, 0, 0)') : 'rgba(255,255,255,1)');
			}
			},
		{
			label:'Temp',
			data: [],
			lineTension: .5,
			pointRadius: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return ((context.raw) ? (context.raw.x < Date.now() ? 3 : 4) : 10);
			},
			borderColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return temperatureGradient(ctx, chartArea);
			},
			backgroundColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return ((context.raw) ? (context.raw.x < Date.now() ? temperatureGradient(ctx, chartArea) : 'rgba(0, 0, 0, 0)') : 'rgba(255,255,255,1)');
			}},
		{
			label:'Dew Point',
			data: [],
			lineTension: .5,
			borderWidth: 1,
			pointRadius:0,
			borderColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				return temperatureGradient(ctx, chartArea);
			}},
		{
			label:'Precip',
			type: 'bar',
			data: [],
			barThickness: 1,
			borderColor: 'rgba(0, 127, 255, .25)',
			backgroundColor: 'rgba(0, 127, 255, .75)'}
		]},
	options:{
		responsive:true,
		maintainAspectRatio:false,
		plugins: {
			legend: {
				display: false,
			}
		},
		scales:{
			y1:{
				min:[11,0,1,2].includes(new Date().getMonth()) ? -10 : 0, //allow chart to show below-zero temps in winter months
				max:110,
				ticks: {color:'rgb(224,224,224)'}
			},
			y2:{
				position:'right',
				min:29.00,
				max:31.00,
				ticks: {color:'rgb(224,224,224)'}
			},
			x:{
				type:'time',
				time:{
					unit:'hour',
					displayFormats:{hour:'HH'}
				},
				grid:{
					color:function(context){
						if(!context.tick) return;
						if(new Date(context.tick.value).getHours() == new Date().getHours()) return 'rgba(128,128,128,.5)';
						else return 'rgba(0,0,0,.5)';
					}
				},
				ticks: {color:'rgb(224,224,224)'}
			}
		}
	}
});

const mb2inHg = mb => Number((Math.round(1000 * mb * 0.0295301) / 1000)).toFixed(2);

function calcDewPoint(T, H){
	const a = 17.27, b = 237.7;
	let RH = H / 100;
	
	return (b * ((a * T) / (b + T) + Math.log(RH))) / (a - ((a * T) / (b + T) + Math.log(RH)))
}

function temperatureGradient(ctx, chartArea){
	const chartWidth = chartArea.right - chartArea.left;
	const chartHeight = chartArea.bottom - chartArea.top;

	if(!temp_grad || tg_chart_w !== chartWidth || tg_chart_h !== chartHeight){
		tg_chart_w = chartWidth;
		tg_chart_h = chartHeight;
		temp_grad = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
		temp_grad.addColorStop(1, 'rgba(255,0,0,.7)'); //red
		temp_grad.addColorStop(0.9, 'rgba(192,0,0,.7)'); //red
		temp_grad.addColorStop(0.84, 'rgba(255,128,0,.7)'); //orange
		temp_grad.addColorStop(0.77, 'rgba(255,255,0,.7)'); //yellow
		temp_grad.addColorStop(0.65, 'rgba(0,255,0,.7)'); //green
		temp_grad.addColorStop(0.5, 'rgba(0,0,255,.7)'); //blue
		temp_grad.addColorStop(0.33, 'rgba(0,128,255,.77)'); //blue-green
		temp_grad.addColorStop(0.32, 'rgba(0,255,255,.88)'); //cyan
		temp_grad.addColorStop(0, 'rgba(255,255,255,1)'); //white
	}
	
	return temp_grad;
}

function humidityGradient(ctx, chartArea){
	const chartWidth = chartArea.right - chartArea.left;
	const chartHeight = chartArea.bottom - chartArea.top;

	if(!hum_grad || hg_chart_w !== chartWidth || hg_chart_h !== chartHeight){
		hg_chart_w = chartWidth;
		hg_chart_h = chartHeight;
		hum_grad = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
		hum_grad.addColorStop(1, 'rgba(0, 192, 255, 1)');
		hum_grad.addColorStop(0, 'rgba(0, 192, 255, 0)');
	}
	
	return hum_grad;
}

//pull the previous day's occurrence of an astro event out of the stored
//history (json.astro) so the day-over-day delta shows on any client right
//away, without it having to watch the change happen itself
function previousEvent(field, event_sec){
	if(!event_sec) return null;

	let day = wxdata.daily.find(d => d[field] === event_sec),
		prev = null;

	if(day) for(const row of (wxdata.astro || [])){
		if(row.dt < day.dt && row[field]) prev = row[field];
	}

	return prev;
}

//"06:42 <Δ -1m:04s> (+3h ago)" — current/previous are unix seconds
function astroStr(current_sec, previous_sec){
	let current = current_sec * 1000,
		rel = `<small>(${Date.now() > current ? '+' : '-'}${formatDistanceToNowStrict(current)})</small>`;

	if(!previous_sec) return `${format(current, 'HH:mm')} ${rel}`;

	let delta = Math.round(current_sec - previous_sec - 86400),
		m = Math.abs(Math.trunc(delta / 60)),
		s = Math.abs(delta % 60),
		sign = delta < 0 ? '-' : '',
		time = (m > 0 ? m+'m' : '') + (m > 0 && s > 0 ? ':' : '') + (s > 0 ? s+'s' : ''),
		delta_str = time ? `<span>&Delta; ${sign}${time}</span>` : '';

	return `${format(current, 'HH:mm')} ${delta_str} ${rel}`;
}

function moonPhase(){
	let p = wxdata.daily[0].moon_phase;

	if(p == 0) return '<small>NEW</small>';
	else if(p == .5) return '<small>FULL</small>';
	else if(p < .5) return `+${Math.round(p * 200)}%`;
	else return `-${Math.round((1 - p) * 200)}%`;
}

function updateDisplay(){
	let now = new Date(),
		now_sec = now.getTime() / 1000,
		precip = false,
		nfo = '',
		d0 = wxdata.daily[0],
		d1 = wxdata.daily[1],
		current_sunrise = wxdata.current.sunrise * 1000,
		current_sunset = wxdata.current.sunset * 1000,
		//which occurrence of each event to display
		sunrise_at = now_sec > d0.sunset ? d1.sunrise : d0.sunrise,
		sunset_at = d0.sunset,
		moonrise_at = d0.moonrise || d1.moonrise,
		moonset_at = d0.moonset || d1.moonset;

	if(now_sec > moonset_at) moonrise_at = d1.moonrise || d0.moonrise;

	//update chart scale
	wxchart.options.scales.y1.min = [11,0,1,2].includes(now.getMonth()) ? -10 : 0;
	wxchart.update();

	//set display theme
	if(now < current_sunrise) body.className = 'predawn';
	else if(now > current_sunset) body.className = 'night';
	else if(now > current_sunrise && now < (current_sunset - ((current_sunset - current_sunrise) / 2))) body.className = 'morn';
	else body.className = 'eve';

	let ml_start = Math.max(moonrise_at, sunset_at) * 1000,
		ml_end = Math.min(moonset_at, d1.sunrise) * 1000,
		moonlight = intervalToDuration({start:ml_start, end:ml_end}),
		daylight = intervalToDuration({start:current_sunrise, end:current_sunset});

	//populate the display
	wxdisplay.querySelector('.temp .current').innerText = Math.round(wxdata.current.temp);
	wxdisplay.querySelector('.temp .min').innerText = Math.round(d0.temp.min);
	wxdisplay.querySelector('.temp .max').innerText = Math.round(d0.temp.max);
	wxdisplay.querySelector('.humidity').innerText = wxdata.current.humidity;
	wxdisplay.querySelector('.pressure').innerText = mb2inHg(wxdata.current.pressure);
	wxdisplay.querySelector('.dew_point').innerText = Math.round(wxdata.current.dew_point);
	wxdisplay.querySelector('.sun .uvi').innerText = wxdata.current.uvi;
	wxdisplay.querySelector('.sun .rise').innerHTML = astroStr(sunrise_at, previousEvent('sunrise', sunrise_at));
	wxdisplay.querySelector('.sun .set').innerHTML = astroStr(sunset_at, previousEvent('sunset', sunset_at));
	wxdisplay.querySelector('.sun .time .lod').innerHTML = `${daylight.hours}h:${daylight.minutes}m`;
	wxdisplay.querySelector('.sun .time .lom').innerHTML = `${moonlight.hours}h:${moonlight.minutes}m`;
	wxdisplay.querySelector('.moon .rise').innerHTML = moonrise_at ? astroStr(moonrise_at, previousEvent('moonrise', moonrise_at)) : '&mdash;';
	wxdisplay.querySelector('.moon .set').innerHTML = moonset_at ? astroStr(moonset_at, previousEvent('moonset', moonset_at)) : '&mdash;';
	wxdisplay.querySelector('.moon .phase').innerHTML = moonPhase();

	precip = !!document.getElementById('wxmap');
	/*for(let i=0; i<12; i++)
		if(wxdata.hourly[i].weather[0].id < 800) precip = true;*/

	if(precip){
		getMap();
		if(Math.floor(wxdata.hourly[0].weather[0].id / 100) == 7) nfo += wxdata.hourly[0].weather[0].main;
		else if(Math.floor(wxdata.hourly[1].weather[0].id / 100) == 7) nfo += wxdata.hourly[1].weather[0].main;
	}

	document.querySelector('#as-of').innerText = format(now, 'HH:mm');
	document.querySelector('#nfo').innerHTML = nfo;
}

//retrieval and storage now happen server-side (see wx-serve/); the browser
//just reads back whatever the cron jobs already fetched for this location
function fetchWeather(){
	fetch(new Request('/wx-serve/api/weather.php?location=' + encodeURIComponent(location_slug)))
		.then(response => {
			if(!response.ok) throw new Error('HTTP ' + response.status);
			return response.json();
		})
		.then(json => {
			Object.assign(wxdata,json);

			let now = new Date();

			//reset chart data
			wxchart.data.datasets[0].data = [];
			wxchart.data.datasets[1].data = [];
			wxchart.data.datasets[2].data = [];
			wxchart.data.datasets[3].data = [];
			wxchart.data.datasets[4].data = [];

			//add logged history to chart
			json.log.forEach(point => {
				wxchart.data.datasets[0].data.push({x: point.t, y: mb2inHg(point.pressure)});
				wxchart.data.datasets[1].data.push({x: point.t, y: point.humidity});
				wxchart.data.datasets[2].data.push({x: point.t, y: point.temp});
				wxchart.data.datasets[3].data.push({x: point.t, y: calcDewPoint(point.temp, point.humidity)});
				wxchart.data.datasets[4].data.push({x: point.t, y: 0});
			});

			//add forecast data to chart and determine overnight low
			let low = 99;
			wxdata.hourly.forEach(hour => {
				let x = hour.dt * 1000,
					nextrise = now < wxdata.current.sunrise * 1000 ? wxdata.current.sunrise * 1000 : wxdata.daily[1].sunrise * 1000;

				wxchart.data.datasets[0].data.push({x: x, y: mb2inHg(hour.pressure)});
				wxchart.data.datasets[1].data.push({x: x, y: hour.humidity});
				wxchart.data.datasets[2].data.push({x: x, y: hour.temp});
				wxchart.data.datasets[3].data.push({x: x, y: calcDewPoint(hour.temp, hour.humidity)});
				wxchart.data.datasets[4].data.push({x: x, y: (hour.pop * 100)});

				if(x < nextrise && hour.temp < low) low = hour.temp;
			});
			wxdata.daily[0].temp.min = low; //set to overnight low

			updateDisplay();
			wxchart.update();

			document.body.classList.remove('error');
			error_state = false;
		}).catch(error => {
			error_state = true;
			console.error('weather fetch err:', error);
			document.body.classList.add('error');
		});
}

function getMap(zoom = 6){
	let lat = wxdata.location.lat,
		lon = wxdata.location.lon,
		n = 2 ** zoom,
		xtile = Math.floor((lon + 180) / 360 * n),
		ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n),
		wxcanvas = document.querySelector('#wxmap canvas'),
		osmcanvas = document.querySelector('#osmap canvas'),
		wxctx = wxcanvas.getContext('2d'),
		osmctx = osmcanvas.getContext('2d'),
		tilesize = 256;

	wxcanvas.width = window.innerWidth;
	wxcanvas.height = window.innerHeight;

	for(let y=0; y<3; y++){
		for(let x=0; x<4; x++){
			fetch(new Request('https://tile.openstreetmap.org/'+zoom+'/'+(xtile + x)+'/'+(ytile + y)+'.png'))
				.then(response => response.blob())
				.then(blob => {
					let imgURL = URL.createObjectURL(blob),
						img = new Image(tilesize,tilesize);

					img.onload = function(){osmctx.drawImage(this,x*tilesize,y*tilesize);};

					img.src = imgURL;
				});
			
			fetch(new Request('https://tile.openweathermap.org/map/precipitation_new/'+zoom+'/'+(xtile + x)+'/'+(ytile + y)+'.png?appid='+apikey))
				.then(response => response.blob())
				.then(blob => {
					let imgURL = URL.createObjectURL(blob),
						img = new Image(tilesize,tilesize);

					img.onload = function(){wxctx.drawImage(this,x*tilesize,y*tilesize);};

					img.src = imgURL;
				});
		}
	}
}

//engage
fetchWeather();

//clock
setInterval(() => wxdisplay.querySelector('.sun .time .current').innerText = format(Date.now(), 'HH:mm:ss'), (1000));

//poll our own server per update_interval; it already staggers the actual
//OpenWeatherMap calls on its own schedule, so every tick here is a cheap DB read
let intervalId;
function updateWeather() {
	update_interval = error_state ? error_interval : normal_interval;
	fetchWeather();

	clearInterval(intervalId);
	intervalId = setInterval(updateWeather, update_interval * 60 * 1000);
}
intervalId = setInterval(updateWeather, update_interval * 60 * 1000);

body.addEventListener('click', () => document.documentElement.requestFullscreen(), {once:true});