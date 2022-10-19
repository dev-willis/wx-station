import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { intervalToDuration } from 'date-fns';
import format from 'date-fns/format';
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';

let apikey = '48ce79e682e5e8f79e39cc1374871d75', //do not steal
	updateInterval = 10, //in minutes
	tg_chart_w, tg_chart_h, hg_chart_w, hg_chart_h,temp_grad, hum_grad, update_i = 0,
	chart_ctx = document.querySelector('#wxchart canvas').getContext('2d'),
	wxdisplay = document.querySelector('#wxdisplay'),
	body = document.body,
	wxdata = {},
	last = {
		update:0, sunrise:0, sunset:0, moonrise:0, moonset:0,
		temp:{
			high:{
				predicted:0,
				recorded:0,
				actual:0
			},
			low:{
				predicted:0,
				recorded:0,
				actual:0
			}}
	},
	sun = {
		rise:null, set:null,
		rise_str	: function(){return astroStrTpl`${this.rise}${last.sunrise}`;},
		set_str		: function(){return astroStrTpl`${this.set}${last.sunset}`;},
	},
	moon = {
		rise:null, set:null,
		rise_str	: function(){return astroStrTpl`${this.rise}${last.moonrise}`;},
		set_str		: function(){return astroStrTpl`${this.set}${last.moonset}`;},
		phase		: () => {
						let p = wxdata.daily[0].moon_phase;
						
						if(p == 0) return '<small>NEW</small>';
						else if(p == .5) return '<small>FULL</small>';
						else if(p < .5) return `+${Math.round(p * 200)}%`;
						else if(p > .5) return `-${Math.round((1 - p) * 200)}%`;
		}
	};

//initialize last object
if(localStorage.last) last = JSON.parse(localStorage.last);
last.update = new Date(last.update);
last.sunrise = new Date(last.sunrise);
last.sunset = new Date(last.sunset);
last.moonrise = new Date(last.moonrise);
last.moonset = new Date(last.moonset);

//initialize astro objects
sun.rise = new Date(last.sunrise.getTime());
sun.set = new Date(last.sunset.getTime());
moon.rise = new Date(last.moonrise.getTime());
moon.set = new Date(last.moonset.getTime());

const wxchart = new Chart(chart_ctx, {
	type:'line',
	data:{
		datasets:[{
			label:'Pressure',
			data: [],
			yAxisID:'y2',
			borderColor: 'rgba(255, 255, 255, .5)',
			backgroundColor: ctx => 'rgba(255, 255, 255, ' + ((ctx.raw) ? (ctx.raw.x < Date.now() ? '.75)' : '0)') : '.5)')},
		{
			label:'Humidity',
			data: [],
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
				return ((context.raw) ? (context.raw.x < Date.now() ? humidityGradient(ctx, chartArea) : 'rgba(0, 0, 0, 0)') : 'rgba(255,255,255,.5)');
			}
			},
		{
			label:'Temp',
			data: [],
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
				return ((context.raw) ? (context.raw.x < Date.now() ? temperatureGradient(ctx, chartArea) : 'rgba(0, 0, 0, 0)') : 'rgba(255,255,255,.5)');
			}},
		{
			label:'Dew Point',
			data: [],
			borderColor: 'rgba(192, 192, 255, .5)',
			borderThickness: 10,
			backgroundColor: 'rgba(0, 255, 255, 0)'},
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
				min:0,
				max:100,
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

function astroStrTpl(strs, current, previous){
	let delta = Math.round(current - previous - 24 * 60 * 60 * 1000) / 1000,
		m = Math.abs(Math.trunc(delta / 60)),
		s = Math.abs(delta % 60),
		d_sign = delta < 0 ? '-' : '',
		d_time = (m > 0 ? m+'m' : '') + (m > 0 && s > 0 ? ':' : '') + (s > 0 ? s+'s' : ''),
		d_str = previous < current ? `<span>&Delta; ${d_sign}${d_time}</span>` : '';

	return `${format(current, 'HH:mm')} ${d_str} <small>(${(Date.now() > current ? '+' : '-')}${formatDistanceToNowStrict(current)})</small>`;
}

function updateDisplay(){
	let now = new Date(),
		precip = false,
		nfo = '',
		cur_rise = wxdata.current.sunrise * 1000,
		cur_set = wxdata.current.sunset * 1000,
		LoD = intervalToDuration({start:cur_rise, end:cur_set}),
		cur_mrise = wxdata.daily[0].moonrise * 1000,
		cur_mset = wxdata.daily[0].moonset * 1000,
		LoM = intervalToDuration({start:cur_mrise, end:cur_mset});
		
	//set display theme
	if(now < cur_rise) body.className = 'predawn';
	else if(now > cur_set) body.className = 'night';
	else if(now > cur_rise && now < (cur_set - ((cur_set - cur_rise) / 2))) body.className = 'morn';
	else body.className = 'eve';
	
	//adjust rise/set times and log previous
	if(sun.rise < cur_rise){
		last.sunrise.setTime(sun.rise.getTime());
		sun.rise.setTime(cur_rise);
	}
	if(now > cur_set){
		sun.rise.setTime(wxdata.daily[1].sunrise * 1000);
		last.sunrise.setTime(cur_rise);
	}
	if(sun.set < cur_set && now > cur_rise){
		last.sunset.setTime(sun.set.getTime());
		sun.set.setTime(cur_set);
	}
	if(cur_mrise == 0){ //moon does not rise today
		cur_mrise = wxdata.daily[1].moonrise * 1000;
		nfo += '| moon rise 0 |';
	}
	if(cur_mset == 0){ //moon does not set today
		cur_mset = wxdata.daily[1].moonset * 1000;
		nfo += '| moon set 0 |';
	}
	if(moon.rise < cur_mrise){
		last.moonrise.setTime(moon.rise.getTime());
		moon.rise.setTime(cur_mrise);
	}
	if(now > cur_mset){
		last.moonrise.setTime(cur_mrise);
		moon.rise.setTime(wxdata.daily[1].moonrise * 1000);
	}
	if(moon.set < cur_mset){
		last.moonset.setTime(moon.set.getTime());
		moon.set.setTime(cur_mset);
	}

	//populate the display
	wxdisplay.querySelector('.temp .current').innerText = Math.round(wxdata.current.temp);
	wxdisplay.querySelector('.temp .min').innerText = Math.round(wxdata.daily[0].temp.min);
	wxdisplay.querySelector('.temp .max').innerText = Math.round(wxdata.daily[0].temp.max);
	wxdisplay.querySelector('.humidity').innerText = wxdata.current.humidity;
	wxdisplay.querySelector('.pressure').innerText = mb2inHg(wxdata.current.pressure);
	wxdisplay.querySelector('.dew_point').innerText = Math.round(wxdata.current.dew_point);
	wxdisplay.querySelector('.sun .uvi').innerText = wxdata.current.uvi;
	wxdisplay.querySelector('.sun .rise').innerHTML = sun.rise_str();
	wxdisplay.querySelector('.sun .set').innerHTML = sun.set_str();
	wxdisplay.querySelector('.sun .time .lod').innerHTML = `${LoD.hours}h:${LoD.minutes}m`;
	wxdisplay.querySelector('.sun .time .lom').innerHTML = `${LoM.hours}h:${LoM.minutes}m`;
	wxdisplay.querySelector('.moon .rise').innerHTML = moon.rise_str();
	wxdisplay.querySelector('.moon .set').innerHTML = moon.set_str();
	wxdisplay.querySelector('.moon .phase').innerHTML = moon.phase();
	
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

function getOC(lat = 36.16754647878633, lon = -86.21153419024921){
	fetch(new Request('https://api.openweathermap.org/data/2.5/onecall?units=imperial&lat='+lat+'&lon='+lon+'&appid='+apikey))
		.then(response => response.json())
		.then(json => {
			Object.assign(wxdata,json);

			let logdata = {'temp': wxdata.current.temp, 'humidity': wxdata.current.humidity, 'pressure': wxdata.current.pressure},
				wxlog = new Array(),
				now = new Date();
			
			//remove old log entries and add the rest to an array
			Object.entries(localStorage).forEach(([key, val]) => {
				if(parseInt(key)){
					let entry_date = new Date(parseInt(key)),
						cutoff_date = new Date(now - (48 * 60 * 60 * 1000));
					
					if(entry_date < cutoff_date) localStorage.removeItem(key);
					else wxlog.push([key,val]);
				}
			});
			wxlog.sort((a, b) => parseInt(a) - parseInt(b));
			
			//log current data
			if(last.update < now - 30 * 60 * 1000) localStorage.setItem(now.getTime(), JSON.stringify(logdata));
			
			//reset chart data
			wxchart.data.datasets[0].data = [];
			wxchart.data.datasets[1].data = [];
			wxchart.data.datasets[2].data = [];
			wxchart.data.datasets[3].data = [];
			wxchart.data.datasets[4].data = [];

			//add logged data to chart
			wxlog.forEach(point => {
				let y = JSON.parse(point[1]),
					x = parseInt(point[0]);
				
				wxchart.data.datasets[0].data.push({x: x, y: mb2inHg(y.pressure)});
				wxchart.data.datasets[1].data.push({x: x, y: y.humidity});
				wxchart.data.datasets[2].data.push({x: x, y: y.temp});
				wxchart.data.datasets[3].data.push({x: x, y: calcDP(y.temp, y.humidity)});
				wxchart.data.datasets[4].data.push({x: x, y: 0});
			});
			
			//add forecase data to chart and determine overnight low
			let low = 99;
			wxdata.hourly.forEach(hour => {
				let x = hour.dt * 1000,
					nextrise = now < wxdata.current.sunrise * 1000 ? wxdata.current.sunrise * 1000 : wxdata.daily[1].sunrise * 1000;

				wxchart.data.datasets[0].data.push({x: x, y: mb2inHg(hour.pressure)});
				wxchart.data.datasets[1].data.push({x: x, y: hour.humidity});
				wxchart.data.datasets[2].data.push({x: x, y: hour.temp});
				wxchart.data.datasets[3].data.push({x: x, y: calcDP(hour.temp, hour.humidity)});
				wxchart.data.datasets[4].data.push({x: x, y: (hour.pop * 100)});

				if(x < nextrise && hour.temp < low) low = hour.temp;
			});
			wxdata.daily[0].temp.min = low; //set to overnight low

			updateDisplay();
			wxchart.update();

			update_i = 0;
			last.update.setTime(now.getTime());
			localStorage.last = JSON.stringify(last);
		}).catch(error => {document.querySelector('#nfo').innerHTML = error + ' | ' + format(new Date(), 'HH:mm:ss'); console.error(error);});
}

function getWX(lat = 36.16754647878633, lon = -86.21153419024921){
	fetch(new Request('https://api.openweathermap.org/data/2.5/weather?units=imperial&lat='+lat+'&lon='+lon+'&appid='+apikey))
		.then(response => response.json())
		.then(json => {
			Object.assign(wxdata,json);
			
			//so there's only one place to look for these
			wxdata.current.temp = json.main.temp;
			wxdata.current.humidity = json.main.humidity;
			wxdata.current.pressure = json.main.pressure;

			updateDisplay();
		}).catch(error => {document.querySelector('#nfo').innerHTML = error + ' | ' + format(new Date(), 'HH:mm:ss'); console.error(error);});
}

function getMap(zoom = 6, lat = 36.1467, lon = -86.8250){
	let n = 2 ** zoom,
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

function calcDP(T, H){
	let a = 17.27, b = 237.7, RH = H / 100;
	return (b * ((a * T) / (b + T) + Math.log(RH))) / (a - ((a * T) / (b + T) + Math.log(RH)))
}

//engage
getOC();

//clock
setInterval(() => wxdisplay.querySelector('.sun .time .current').innerText = format(Date.now(), 'HH:mm:ss'), (1000));

//refresh current data per updateInterval but forecast only once an hour
setInterval(() => ++update_i >= 60 / updateInterval ? getOC() : getWX(), (updateInterval * 60 * 1000));

body.addEventListener('click', () => document.documentElement.requestFullscreen(), {once:true});