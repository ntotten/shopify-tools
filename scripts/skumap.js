var fs = require('fs');
var util = require('util');
var request = require('request');

var config = JSON.parse(fs.readFileSync('./config.json'));


var urlFormat = "https://%s:%s@nhbooks.myshopify.com/admin/products.json?fields=id,variants&page=%s&limit=%s";

var allProducts = [];
var page = 0;
var limit = 250;

var complete = function() {
    fs.writeFileSync('./output/products.json', JSON.stringify(allProducts));
}

var loadProducts = function(page, callback) {
  console.log("Downloading products on page: " + page);
  var url = util.format(urlFormat, config.api_key, config.password, page, limit);
  request(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var data = JSON.parse(body);
      callback(data.products);
    }
  })
}

var processProducts = function(products) {
  for (var i = 0; i < products.length; i++) {
    var product = products[i];
    allProducts.push({ id: product.id, sku: product.variants[0].sku });
  }

  if (products.length < limit) {
    complete();
  } else {
    page++;
    loadProducts(page, processProducts);
  }
}

loadProducts(page, processProducts);
