var util = require('util');
var csv = require('csv-parse');
var fs = require('fs');
var request = require('request');
var _ = require('lodash');


var urlFormat = "https://%s:%s@nhbooks.myshopify.com/admin/redirects.json";

var categories = JSON.parse(fs.readFileSync('./output/categories.json'));

var config = JSON.parse(fs.readFileSync('./config.json'));

var successFilePath = 'category_redirects.success.log';
var errorFilePath = 'category_redirects.errors.log';

var successes = [];
if (fs.existsSync(successFilePath)) {
  successes = JSON.parse(fs.readFileSync(successFilePath));
}

var queueRedirects = function(categories, parent) {

  for (var i = 0; i < categories.length; i++) {
    var category = categories[i];

    var path = '/';
    if (parent) {
      path += parent.key + '/';
    }
    path += category.key;

    var target = '/collections/' + category.key;

    var next = function() {
      if (category.children.length > 0) {
        queueRedirects(category.children, category)
      }
    };

    queueRedirect(path, target, next);
  }

}

var redirects = [];
var queueRedirect = function(path, target, callback) {
  var redirect = {
    path: path,
    target: target
  };
  redirects.push(redirect);
  callback();
}

var cycle = 500;
var index = -1;
var createRedirects = function() {
  index++;
  if (index < redirects.length) {
    var redirect = redirects[index];
    // Check if this product is in the success list
    var success = _.find(successes, function(item) {
      return item === redirect.path;
    });

    if (success) {
      console.log('skipping: ' + redirect.path)
        // If this redirect was already created, skip it and move on
      createRedirects();
    } else {
      setTimeout(function() {
        createRedirect(redirect, function() {
          createRedirects();
        });
      }, cycle);
    }
  } else {
    // Exit the loop
    console.log("Wrote " + successes.length + ' url rewrites.');
  }
};

var createRedirect = function(redirect, callback) {
  var data = {
    redirect: redirect
  };
  request({
    method: 'POST',
    url: util.format(urlFormat, config.api_key, config.password),
    json: data
  }, function(error, response, body) {
    if (!error && response.statusCode == 201) {
      console.log('Created redirect for: ' + redirect.path);
      successes.push(redirect.path);
      writeLogEntry(successFilePath, redirect.path);
    } else {
      console.log('Error creating redirect for: ' + redirect.path);
      writeLogEntry(errorFilePath, redirect.path);
    }
    // Finished creating redirect, move to the next one
    callback();
  });
};

var writeLogEntry = function(filePath, key) {
  var keys = [];
  if (fs.existsSync(filePath)) {
    keys = JSON.parse(fs.readFileSync(filePath));
  }
  keys.push(key)
  fs.writeFileSync(filePath, JSON.stringify(keys));
}


queueRedirects(categories);
createRedirects();
