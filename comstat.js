'use strict';

const fetch = require('node-fetch');
const Cache = require('cache');
const geo = require('geojson');

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const cache = new Cache(60 * 60 * 1000); // 1 hour cache

async function getYearlyMotoThefts() {
    const params = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8',
        },
        body: JSON.stringify({
            "filters":[
                {"key":"PRECINCTKey","label":"Precinct","values":["Citywide"]},
                {"key":"BOROKey","label":"Patrol Borough","values":["Citywide"]},
                {"key":"RECORDID","label":"SELECTION","values":["YTD_COMPLAINTS_G.L.A."]}
            ]
        }),
    };
    const res = await fetch('https://compstat.nypdonline.org/api/reports/13/datasource/list', params);
    const body = await res.json();
    const dateRe = /([0-9]{2}\/[0-9]{2}\/[0-9]{2}) [0-9]{1,2}[AP]M/;
    const parsedReports = body.map(({ Value: value, Title: titleHtml }) => {
        const [lat,lon] = value.split(',');
        const date = new Date(dateRe.exec(titleHtml)[1]);
        const lowerTitle = titleHtml.toLowerCase();
        const isMoto = 
            lowerTitle.includes('grand of motorcycle') || 
            lowerTitle.includes('grand of moped');
        return { lon, lat, isMoto, date, 
            daysAgo: Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)), 
        };
    });
    return parsedReports.filter(({ isMoto }) => isMoto).map(({ isMoto, ...rest }) => rest)
        .sort(({ date: a }, { date: b }) => a - b)
    
}

module.exports.yearToDate = async event => {
    const CACHE_KEY = 'YearToDate';
    let stats = cache.get(CACHE_KEY);
    if(!stats) {
        console.log('updating cache');
        stats = await getYearlyMotoThefts();
        cache.put(CACHE_KEY, stats);
    }
    return {
        statusCode: 200,
        body: JSON.stringify(geo.parse(stats, { Point: ['lat', 'lon'] })),
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        },
    }
};
