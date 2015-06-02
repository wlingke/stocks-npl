var ALCHEMY_API_KEY = "c46b2a343de29e3e00c04d1e41a2d3a27e995c07";
var XIGNITE_API_KEY = "B7C1C6D9C01E47979EFBBAE8A5BE13C5";

var Promise = require('bluebird');
var _ = require('lodash');

var fs = require('fs');
var moment = require('moment');
require('./moment-business');
var csv = Promise.promisifyAll(require('csv'));
var AlchemyApi = require('alchemy-api');
var request = Promise.promisify(require('request'));

Promise.promisifyAll(AlchemyApi.prototype);
var alchemy = new AlchemyApi(ALCHEMY_API_KEY);

var transcripts_directory = "transcripts";
var transcript_fileNames = fs.readdirSync(transcripts_directory);
var maxRetrieve = 100;
var index = "XLF";

function parseTranscriptFileName(fileName) {
    var date = fileName.slice(0, 10);

    var split1 = fileName.split(" ");
    var split2 = split1[1].split('.');
    var ticker = split2[0];

    return {
        date: date,
        ticker: ticker,
        fileName: fileName
    }
}

function calculateScore(keywordsArray) {

    var totalPositiveRelevance = 0;
    var totalNegativeRelevance = 0;
    var totalRelevance = 0;

    var totalPositiveSentimentStrength = 0;
    var totalNegativeSentimentStrength = 0;

    var numberPositive = 0;
    var numberNegative = 0;
    var numberNeutral = 0;

    keywordsArray.forEach(function (keyword) {
        var relevance = parseFloat(keyword.relevance);
        //if(relevance >= minRelevance){
        totalRelevance += relevance;
        var sentimentScore = parseFloat(keyword.sentiment.score);

        if (keyword.sentiment.type === "positive") {
            totalPositiveRelevance += relevance;
            totalPositiveSentimentStrength = relevance * sentimentScore;
            numberPositive++;
        } else if (keyword.sentiment.type === "negative") {
            totalNegativeRelevance += relevance;
            totalNegativeSentimentStrength = relevance * sentimentScore;
            numberNegative++;
        } else {
            numberNeutral++;
        }
        //}
    });


    return {
        posKeywordRelevance: totalRelevance === 0 ? 0 : totalPositiveRelevance / totalRelevance,
        negKeywordRelevance: totalRelevance === 0 ? 0 : totalNegativeRelevance / totalRelevance,
        posSentimentStrength: totalPositiveRelevance === 0 ? 0 : totalPositiveSentimentStrength / totalPositiveRelevance,
        negSentimentStrength: totalNegativeRelevance === 0 ? 0 : totalNegativeSentimentStrength / totalNegativeRelevance,
        numberPositive: numberPositive,
        numberNegative: numberNegative,
        numberNeutral: numberNeutral
    };
}

function getOpenQuoteForDate(symbol, moment) {
    var ignite_base_url = "http://www.xignite.com/xGlobalHistorical.json/GetGlobalHistoricalQuote";
    var qs = {
        _Token: XIGNITE_API_KEY,
        IdentifierType: "Symbol",
        Identifier: symbol,
        AdjustmentMethod: "SplitAndCashDividend",
        AsOfDate: moment.format("MM/DD/YYYY")
    };

    return request({url: ignite_base_url, qs: qs})
        .spread(function(response, body){
            var result = JSON.parse(body);
            return result.Open;
        })
}

var transcripts = transcript_fileNames.map(parseTranscriptFileName);
var results = [];
var promises = [];
transcripts.forEach(function (transcript) {
    var data = fs.readFileSync(transcripts_directory + "/" + transcript.fileName, {encoding: 'utf8'});
    var promise = alchemy.keywordsAsync(data, {sentiment: 1, maxRetrieve: maxRetrieve})
        .then(function (response) {
            var keywords = response.keywords;
            var scores = calculateScore(keywords);
            var result = _.cloneDeep(transcript);
            _.extend(result, scores);
            return result;
        });

    promises.push(promise);
});

var holidays = ["2015-01-19", "2015-02-16", "2015-05-25"];
function isRangeInHoliday (start, end){
    for (var i = 0, ii = holidays.length; i < ii; i++){
        var holiday = moment(holidays[i], "YYYY-MM-DD");
        if(holiday.isAfter(start) && (holiday.isBefore(end) || holiday.isSame(end))){
            return true;
        }
    }

    return false;
}


Promise.all(promises)
    .then(function(results){
        var promises = [];

        results.forEach(function(result){
            var ticker = result.ticker;
            var initialDate = moment(result.date, "YYYY-MM-DD");
            var dates = [initialDate.clone().businessAdd(1), initialDate.clone().businessAdd(5), initialDate.clone().businessAdd(15)];
            dates = dates.map(function(date){
                if(isRangeInHoliday(initialDate, date)){
                    return date.businessAdd(1);
                }

                return date;
            });


            var props = {
                stockDay1: getOpenQuoteForDate(ticker, dates[0]),
                stockDay5: getOpenQuoteForDate(ticker, dates[1]),
                stockDay15: getOpenQuoteForDate(ticker, dates[2]),
                indexDay1: getOpenQuoteForDate(index, dates[0]),
                indexDay5: getOpenQuoteForDate(index, dates[1]),
                indexDay15: getOpenQuoteForDate(index, dates[2])
            };

            var p = Promise.props(props)
                .then(function(r){
                    var final = _.cloneDeep(result);
                    _.extend(final, r);

                    return final;
                });

            promises.push(p);
        });

        return Promise.all(promises);
    })
    .then(function (results) {
        return csv.stringifyAsync(results, {header: true})
    })
    .then(function (output) {
        var filename = "export_results_" + (new Date()).getTime() + ".csv";
        fs.writeFileSync(filename, output)
    })
    .then(function () {
        console.log("DONE")
    });

