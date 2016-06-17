#!/usr/bin/ruby -Ku
ARGF.each do |line|
	c = line.chomp!
	line += ":sample2"
	print line
	print "\n" unless c.nil?
end
