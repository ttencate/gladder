#!/usr/bin/env ruby

require 'sinatra'

# Compile CoffeeScript to JavaScript if a .coffee file is found,
# otherwise just serve up the .js file.
get %r{/(.*)\.js} do |basename|
  content_type 'application/javascript'
  coffee = "#{basename}.coffee"
  if File.exist?(coffee)
    print "Compiling #{coffee}...\n"
    response = `coffee -c -p #{coffee}`
    raise 'Compile error' if $?.exitstatus != 0
    response
  else
    send_file "#{basename}.js"
  end
end

get %r{/(.*)} do |filename|
  send_file filename
end
