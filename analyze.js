var _ = require('lodash')
var Promise = require('bluebird')
var csv = Promise.promisifyAll(require('csv'));
var fs = require('fs');
var dataFile = "dataScrubbed.csv";
var dnn = require('dnn');
var training_epochs = 1000, lr = 0.0001;

var training = {
    predictors: [],
    results5Day: [],
    results15Day: []
};

var validation = {
    predictors: [],
    results5Day: [],
    results15Day: []
};

var lr5DayClassifier;
var lr15DayClassifier;


csv.parseAsync(fs.readFileSync(dataFile, {encoding: 'utf8'}))
    .then(function(data){
        var fullData = data.slice(1);
        var trainingCount = 15;
        var len = fullData.length;
        var predictors = [];
        var results5Day = [];
        var results15Day = [];

        fullData.forEach(function(item){

            var predictor = item.slice(0,7).map(function(i){
                return parseFloat(i);
            });
            var result5Day = parseFloat(item[7]);
            var result15Day = parseFloat(item[8]);


            predictors.push(predictor);
            results5Day.push([result5Day, 1-result5Day]);
            results15Day.push([result15Day, 1-result15Day]);
        });

        training.predictors = predictors.slice(0,trainingCount);
        validation.predictors = predictors.slice(trainingCount, len);

        training.results5Day = results5Day.slice(0, trainingCount);
        validation.results5Day = results5Day.slice(trainingCount, len);

        training.results15Day = results15Day.slice(0,trainingCount);
        validation.results15Day = results15Day.slice(trainingCount, len);

        console.log(training)
        console.log(validation)
    })
    .then(function(){
        lr5DayClassifier = new dnn.LogisticRegression({
            input: training.predictors,
            label: training.results5Day,
            n_in: 7,
            n_out: 2
        });
        lr5DayClassifier.train({
            lr: lr,
            epochs: training_epochs
        })

        lr15DayClassifier = new dnn.LogisticRegression({
            input: training.predictors,
            label: training.results15Day,
            n_in: 7,
            n_out: 2
        });

        lr15DayClassifier.train({
            lr: lr,
            epochs: training_epochs
        })


        return {
            pred5Day: lr5DayClassifier.predict(validation.predictors),
            pred15Day: lr15DayClassifier.predict(validation.predictors)
        }

    })
    .then(function(results){
        var r = [];
        var factor = 1000;
        for(var i = 0, ii = results.pred5Day.length; i<ii; i ++){
            var p5value = Math.round(results.pred5Day[i][0]*factor)/factor;
            var p15value = Math.round(results.pred15Day[i][0]*factor)/factor;

            r.push([p5value, p15value])
        }

        return csv.stringifyAsync(r, {header: true})
    })
    .then(function (output) {
        var filename = "export_results_" + (new Date()).getTime() + ".csv";
        fs.writeFileSync(filename, output)
    })
    .then(function () {
        console.log("DONE")
    });